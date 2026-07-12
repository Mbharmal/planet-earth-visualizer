import type maplibregl from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import styles from './MapView.module.css'
import { useMapLibre } from './useMapLibre'

interface MapViewProps {
  /** Called with the map instance once the style has loaded, and with null on teardown. */
  onMap?: (map: maplibregl.Map | null) => void
  /** Called with a fatal init error message (WebGL unavailable, style unreachable). */
  onError?: (message: string | null) => void
}

export function MapView({ onMap, onError }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { map, error } = useMapLibre(containerRef)

  useEffect(() => {
    onMap?.(map)
  }, [map, onMap])

  useEffect(() => {
    onError?.(error)
  }, [error, onError])

  return <div ref={containerRef} className={styles.map} />
}
