import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useState, type RefObject } from 'react'
import { STYLE_URL } from '../config'

export interface MapLibreState {
  map: maplibregl.Map | null
  /** Fatal init problem (no WebGL, style unreachable) — show this instead of a blank page. */
  error: string | null
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}

/**
 * Owns the MapLibre map lifecycle. Returns the map instance once its style
 * has loaded (null before that), so callers can safely add sources/layers.
 */
export function useMapLibre(containerRef: RefObject<HTMLDivElement | null>): MapLibreState {
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (!webglAvailable()) {
      setError(
        'Your browser could not create a WebGL2 context, which the 3D globe needs. ' +
          'Enable hardware acceleration in the browser settings. In a remote-desktop session ' +
          '(no GPU available), newer Chrome disables software WebGL — relaunch it as ' +
          '"google-chrome --enable-unsafe-swiftshader", or use Firefox.',
      )
      return
    }

    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        center: [15, 25],
        zoom: 1.7,
        minZoom: 1,
        maxZoom: 15,
      })
    } catch (err) {
      setError(`The map failed to start: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

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

    // Surface a fatal failure to fetch the style itself (offline, blocked by an
    // extension, provider down) — otherwise the loading spinner spins forever.
    map.on('error', (e) => {
      if (!map.isStyleLoaded() && !map.loaded()) {
        const msg = e.error?.message ?? 'unknown error'
        if (/style|Failed to fetch|NetworkError|load/i.test(msg)) {
          setError(
            `Could not load the basemap (${msg}). Check your internet connection ` +
              'and that nothing (adblock/VPN/firewall) is blocking tiles.openfreemap.org.',
          )
        }
      }
    })

    if (import.meta.env.DEV) {
      // Exposed for dev tooling (tools/*.mjs verification scripts).
      ;(window as unknown as { __map?: maplibregl.Map }).__map = map
    }

    return () => {
      setMap(null)
      setError(null)
      map.remove()
    }
  }, [containerRef])

  return { map, error }
}
