import type * as DuckDB from '@duckdb/duckdb-wasm';
import * as h3 from 'h3-js';
import { createUrbanEnergySeedSql } from '../data/sampleUrbanEnergy';
import type { StoredGeoDataset } from '../types';

type QueryRow = Record<string, unknown>;

export interface QueryOptions {
  timeoutMs?: number;
  maxRows?: number;
  description?: string;
}

export interface QueryExecutionLog {
  timestamp: string;
  sql: string;
  description?: string;
  durationMs: number;
  success: boolean;
  rowCount?: number;
  error?: string;
}

export interface TableSummary {
  tableName: string;
  description: string;
}

export interface TableSchema {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
}

const DEFAULT_TABLE_DESCRIPTIONS: Record<string, string> = {
  urban_energy:
    'Synthetic London building-level metrics with lat/lon, demand, solar potential, CO2 savings, and heat-pump viability.',
};

const DEFAULT_QUERY_TIMEOUT_MS = 10_000;
const QUERY_LOG_RETENTION = 100;

function isUploadedTable(tableName: string): boolean {
  return tableName.startsWith('uploaded_geo_');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const BUNDLES: DuckDB.DuckDBBundles = {
  mvp: {
    mainModule: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
      import.meta.url,
    ).toString(),
    mainWorker: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
      import.meta.url,
    ).toString(),
  },
  eh: {
    mainModule: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
      import.meta.url,
    ).toString(),
    mainWorker: new URL(
      '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
      import.meta.url,
    ).toString(),
  },
};

export class DuckDBService {
  private db: DuckDB.AsyncDuckDB | null = null;

  private conn: DuckDB.AsyncDuckDBConnection | null = null;

  private initialized = false;

  private initializing: Promise<void> | null = null;

  private queryLogs: QueryExecutionLog[] = [];

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeInternal(): Promise<void> {
    if (this.initialized) return;

    const duckdb = await import('@duckdb/duckdb-wasm');
    const logger = new duckdb.ConsoleLogger();
    const bundle = await duckdb.selectBundle(BUNDLES);

    if (!bundle.mainWorker) {
      throw new Error('DuckDB worker bundle is unavailable in this environment.');
    }

    const worker = new Worker(bundle.mainWorker);
    this.db = new duckdb.AsyncDuckDB(logger, worker);
    await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    this.conn = await this.db.connect();

    await this.conn.query('INSTALL spatial; LOAD spatial;');

    try {
      await this.conn.query('INSTALL h3 FROM community; LOAD h3;');
    } catch (error) {
      console.warn('DuckDB h3 extension not available, continuing without it.', error);
    }

    await this.conn.query(createUrbanEnergySeedSql);
    this.initialized = true;
  }

  private async getConnection(): Promise<DuckDB.AsyncDuckDBConnection> {
    await this.init();
    if (!this.conn) {
      throw new Error('DuckDB connection is not initialized.');
    }
    return this.conn;
  }

  async exec(sql: string): Promise<void> {
    const conn = await this.getConnection();
    await conn.query(sql);
  }

  private normalizeSql(sql: string): string {
    return sql.trim().replace(/;+\s*$/g, '');
  }

  private wrapWithLimit(sql: string, maxRows?: number): string {
    if (!maxRows || maxRows <= 0) {
      return sql;
    }
    return `SELECT * FROM (${sql}) AS guarded_query LIMIT ${Math.floor(maxRows)}`;
  }

  private pushQueryLog(entry: QueryExecutionLog): void {
    this.queryLogs.unshift(entry);
    if (this.queryLogs.length > QUERY_LOG_RETENTION) {
      this.queryLogs.length = QUERY_LOG_RETENTION;
    }
  }

  getRecentQueryLogs(limit = 20): QueryExecutionLog[] {
    return this.queryLogs.slice(0, Math.max(1, limit));
  }

  async query(sql: string, options: QueryOptions = {}): Promise<QueryRow[]> {
    const conn = await this.getConnection();
    const normalizedSql = this.normalizeSql(sql);
    const boundedSql = this.wrapWithLimit(normalizedSql, options.maxRows);
    const timeoutMs = options.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
    const startedAt = performance.now();

    try {
      const resultPromise = conn.query(boundedSql);
      const result =
        timeoutMs > 0
          ? await Promise.race([
              resultPromise,
              new Promise<never>((_, reject) => {
                window.setTimeout(() => {
                  reject(new Error(`Query timed out after ${timeoutMs}ms.`));
                }, timeoutMs);
              }),
            ])
          : await resultPromise;

      const rows = result.toArray().map((row) => {
        if (typeof row.toJSON === 'function') {
          return row.toJSON() as QueryRow;
        }
        return row as QueryRow;
      });

      this.pushQueryLog({
        timestamp: new Date().toISOString(),
        sql: boundedSql,
        description: options.description,
        durationMs: Math.round(performance.now() - startedAt),
        success: true,
        rowCount: rows.length,
      });

      return rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown DuckDB query error.';

      this.pushQueryLog({
        timestamp: new Date().toISOString(),
        sql: boundedSql,
        description: options.description,
        durationMs: Math.round(performance.now() - startedAt),
        success: false,
        error: message,
      });

      throw error;
    }
  }

  async listTables(): Promise<TableSummary[]> {
    const rows = await this.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'main'
      ORDER BY table_name
    `);

    return rows.map((row) => {
      const tableName = String(row.table_name ?? '');
      return {
        tableName,
        description:
          DEFAULT_TABLE_DESCRIPTIONS[tableName] ||
          (isUploadedTable(tableName)
            ? 'User-uploaded GeoJSON polygon dataset stored as H3 cells for analysis.'
            : 'No description available.'),
      };
    });
  }

  async getTableSchema(tableName: string): Promise<TableSchema> {
    const rows = await this.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'main' AND table_name = '${tableName.replace(/'/g, "''")}'
      ORDER BY ordinal_position
    `);

    return {
      tableName,
      columns: rows.map((row) => ({
        name: String(row.column_name ?? ''),
        type: String(row.data_type ?? 'UNKNOWN'),
      })),
    };
  }

  async buildSchemaContextForPrompt(userPrompt: string): Promise<string> {
    const tableSummaries = await this.listTables();
    if (!tableSummaries.length) {
      return 'No database tables available.';
    }

    const terms = new Set(
      userPrompt
        .toLowerCase()
        .replace(/[^a-z0-9_\s-]/g, ' ')
        .split(/\s+/)
        .filter((term) => term.length > 2),
    );

    const scored = await Promise.all(
      tableSummaries.map(async (table) => {
        const schema = await this.getTableSchema(table.tableName);
        const joined = `${table.tableName} ${table.description} ${schema.columns
          .map((column) => column.name)
          .join(' ')}`.toLowerCase();

        let score = 0;
        for (const term of terms) {
          if (joined.includes(term)) score += 1;
          if (term.includes('solar') && joined.includes('solar_potential')) score += 2;
          if (term.includes('heat') && joined.includes('heat_pump')) score += 2;
          if (term.includes('co2') && joined.includes('co2')) score += 2;
          if (term.includes('energy') && joined.includes('energy_demand')) score += 2;
        }

        return {
          table,
          schema,
          score,
        };
      }),
    );

    const selected = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter((item, index) => item.score > 0 || index === 0);

    const sections = await Promise.all(
      selected.map(async ({ table, schema }) => {
        const columns = schema.columns.map((column) => `${column.name} (${column.type})`).join(', ');
        const sampleRows = await this.query(
          `SELECT * FROM ${quoteIdentifier(table.tableName)} LIMIT 2`,
          { timeoutMs: 4_000, maxRows: 2, description: `schema-context:${table.tableName}` },
        );

        return [
          `Table: ${table.tableName}`,
          `Description: ${table.description}`,
          `Columns: ${columns}`,
          `Sample rows: ${JSON.stringify(sampleRows)}`,
        ].join('\n');
      }),
    );

    return sections.join('\n\n');
  }

  async registerPolygonDataset(dataset: StoredGeoDataset): Promise<void> {
    const tableName = dataset.tableName;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
      throw new Error('Invalid dataset table name.');
    }

    const conn = await this.getConnection();
    const table = quoteIdentifier(tableName);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        dataset_id VARCHAR,
        dataset_name VARCHAR,
        feature_id VARCHAR,
        feature_index INTEGER,
        geometry_type VARCHAR,
        resolution INTEGER,
        h3_index VARCHAR,
        geom VARCHAR,
        properties_json VARCHAR
      );
    `);

    await conn.query(`DELETE FROM ${table};`);

    const rows = dataset.features.flatMap((feature) =>
      feature.h3Cells.map((h3Index) => ({
        datasetId: dataset.id,
        datasetName: dataset.name,
        featureId: feature.id,
        featureIndex: feature.index,
        geometryType: feature.geometryType,
        resolution: dataset.resolution,
        h3Index,
        propertiesJson: JSON.stringify(feature.properties),
      })),
    );

    const rowsWithGeometry = rows.map((row) => ({
      ...row,
      geom: JSON.stringify({
        type: 'Polygon',
        coordinates: [h3.cellToBoundary(row.h3Index, true)],
      }),
    }));

    for (const chunk of chunkArray(rowsWithGeometry, 200)) {
      const values = chunk
        .map(
          (row) => `(
            ${escapeSqlString(row.datasetId)},
            ${escapeSqlString(row.datasetName)},
            ${escapeSqlString(row.featureId)},
            ${row.featureIndex},
            ${escapeSqlString(row.geometryType)},
            ${dataset.resolution},
            ${escapeSqlString(row.h3Index)},
            ${escapeSqlString(row.geom)},
            ${escapeSqlString(row.propertiesJson)}
          )`,
        )
        .join(',');

      await conn.query(`
        INSERT INTO ${table} (
          dataset_id,
          dataset_name,
          feature_id,
          feature_index,
          geometry_type,
          resolution,
          h3_index,
          geom,
          properties_json
        ) VALUES ${values};
      `);
    }
  }

  async dropPolygonDataset(tableName: string): Promise<void> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
      return;
    }

    const conn = await this.getConnection();
    await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)};`);
  }
}

export const duckdbService = new DuckDBService();
