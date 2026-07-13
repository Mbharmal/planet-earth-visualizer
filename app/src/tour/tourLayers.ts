import type { FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'

export const TOUR_ARCS_SOURCE = 'tour-arcs-src'
export const TOUR_POINTS_SOURCE = 'tour-points-src'
export const LAYER_TOUR_ARCS_GLOW = 'tour-arcs-glow'
export const LAYER_TOUR_ARCS = 'tour-arcs'
export const LAYER_TOUR_HALO = 'tour-points-halo'
export const LAYER_TOUR_POINTS = 'tour-points'

const TOUR_LAYERS = [LAYER_TOUR_POINTS, LAYER_TOUR_HALO, LAYER_TOUR_ARCS, LAYER_TOUR_ARCS_GLOW]

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Feature properties contract: { id, color, state: 'drawing' | 'done' }. */
export function addTourLayers(map: MapLibreMap) {
  if (map.getSource(TOUR_ARCS_SOURCE)) return // idempotent (StrictMode, re-entry)

  map.addSource(TOUR_ARCS_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(TOUR_POINTS_SOURCE, { type: 'geojson', data: EMPTY })

  // Added without beforeId → these sit above every base view layer, as intended.
  map.addLayer({
    id: LAYER_TOUR_ARCS_GLOW,
    type: 'line',
    source: TOUR_ARCS_SOURCE,
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 5, 8, 9],
      'line-blur': 4,
      'line-opacity': ['case', ['==', ['get', 'state'], 'done'], 0.1, 0.25],
    },
  })
  map.addLayer({
    id: LAYER_TOUR_ARCS,
    type: 'line',
    source: TOUR_ARCS_SOURCE,
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.8, 8, 3.2],
      'line-opacity': ['case', ['==', ['get', 'state'], 'done'], 0.35, 0.95],
    },
  })
  map.addLayer({
    id: LAYER_TOUR_HALO,
    type: 'circle',
    source: TOUR_POINTS_SOURCE,
    paint: {
      'circle-radius': 14,
      'circle-color': ['get', 'color'],
      'circle-blur': 0.8,
      'circle-opacity': 0.5,
    },
  })
  map.addLayer({
    id: LAYER_TOUR_POINTS,
    type: 'circle',
    source: TOUR_POINTS_SOURCE,
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
}

export function setTourArcs(map: MapLibreMap, data: FeatureCollection<LineString>) {
  map.getSource<GeoJSONSource>(TOUR_ARCS_SOURCE)?.setData(data)
}

export function setTourPoints(map: MapLibreMap, data: FeatureCollection<Point>) {
  map.getSource<GeoJSONSource>(TOUR_POINTS_SOURCE)?.setData(data)
}

export function removeTourLayers(map: MapLibreMap) {
  for (const layer of TOUR_LAYERS) {
    if (map.getLayer(layer)) map.removeLayer(layer)
  }
  for (const source of [TOUR_ARCS_SOURCE, TOUR_POINTS_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source)
  }
}
