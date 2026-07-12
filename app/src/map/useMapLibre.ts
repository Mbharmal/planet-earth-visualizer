import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useState, type RefObject } from 'react'
import { STYLE_URL } from '../config'

/**
 * Owns the MapLibre map lifecycle. Returns the map instance once its style
 * has loaded (null before that), so callers can safely add sources/layers.
 */
export function useMapLibre(containerRef: RefObject<HTMLDivElement | null>) {
  const [map, setMap] = useState<maplibregl.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [15, 25],
      zoom: 1.7,
      minZoom: 1,
      maxZoom: 15,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('style.load', () => {
      // The basemap style doesn't declare a projection; switch to globe here.
      map.setProjection({ type: 'globe' })
      // Atmosphere halo when zoomed out, fading away as you approach the ground.
      map.setSky({
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
      })
    })

    map.on('load', () => setMap(map))

    if (import.meta.env.DEV) {
      // Exposed for dev tooling (tools/*.mjs verification scripts).
      ;(window as unknown as { __map?: maplibregl.Map }).__map = map
    }

    return () => {
      setMap(null)
      map.remove()
    }
  }, [containerRef])

  return map
}
