import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapProps {
  onReady: (container: HTMLDivElement) => void;
}

export default function Map({ onReady }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    onReady(containerRef.current);
  }, [onReady]);

  return <div ref={containerRef} className="map-canvas" aria-label="Interactive energy map" />;
}
