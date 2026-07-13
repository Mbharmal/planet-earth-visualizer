import type { Journey } from '@pev/shared'
import type { Feature, FeatureCollection, LineString, Position } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { bowedArc } from '../data/arcs'

export const JOURNEY_PATH_SOURCE = 'journey-path-src'
export const JOURNEY_POINTS_SOURCE = 'journey-points-src'
export const LAYER_JOURNEY_FUTURE = 'journey-future'
export const LAYER_JOURNEY_DONE_GLOW = 'journey-done-glow'
export const LAYER_JOURNEY_DONE = 'journey-done'
export const LAYER_JOURNEY_POINTS = 'journey-points'
export const LAYER_JOURNEY_NUMBERS = 'journey-numbers'

const JOURNEY_LAYERS = [
  LAYER_JOURNEY_NUMBERS,
  LAYER_JOURNEY_POINTS,
  LAYER_JOURNEY_DONE,
  LAYER_JOURNEY_DONE_GLOW,
  LAYER_JOURNEY_FUTURE,
]

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Precomputed bowed segments between consecutive waypoints (null for coincident points). */
export function journeySegments(journey: Journey): (Position[] | null)[] {
  const segments: (Position[] | null)[] = []
  for (let i = 0; i < journey.waypoints.length - 1; i++) {
    const a = journey.waypoints[i]!
    const b = journey.waypoints[i + 1]!
    segments.push(bowedArc([a.lng, a.lat], [b.lng, b.lat]))
  }
  return segments
}

export function addJourneyLayers(map: MapLibreMap, journey: Journey) {
  removeJourneyLayers(map)

  map.addSource(JOURNEY_PATH_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(JOURNEY_POINTS_SOURCE, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: journey.waypoints.map((wp, i) => ({
        type: 'Feature' as const,
        properties: { id: wp.id, number: String(i + 1), visited: false },
        geometry: { type: 'Point' as const, coordinates: [wp.lng, wp.lat] },
      })),
    },
    promoteId: 'id',
  })

  // Faint dashed preview of the not-yet-traveled path.
  map.addLayer({
    id: LAYER_JOURNEY_FUTURE,
    type: 'line',
    source: JOURNEY_PATH_SOURCE,
    filter: ['==', ['get', 'state'], 'future'],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': journey.color,
      'line-width': 1.6,
      'line-opacity': 0.3,
      'line-dasharray': [1.5, 2.5],
    },
  })
  map.addLayer({
    id: LAYER_JOURNEY_DONE_GLOW,
    type: 'line',
    source: JOURNEY_PATH_SOURCE,
    filter: ['!=', ['get', 'state'], 'future'],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': journey.color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 6, 8, 10],
      'line-blur': 4,
      'line-opacity': 0.2,
    },
  })
  map.addLayer({
    id: LAYER_JOURNEY_DONE,
    type: 'line',
    source: JOURNEY_PATH_SOURCE,
    filter: ['!=', ['get', 'state'], 'future'],
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': journey.color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.2, 8, 3.6],
      'line-opacity': ['case', ['==', ['get', 'state'], 'active'], 0.95, 0.75],
    },
  })
  map.addLayer({
    id: LAYER_JOURNEY_POINTS,
    type: 'circle',
    source: JOURNEY_POINTS_SOURCE,
    paint: {
      'circle-radius': 11,
      'circle-color': ['case', ['boolean', ['feature-state', 'visited'], false], journey.color, '#8891ad'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: LAYER_JOURNEY_NUMBERS,
    type: 'symbol',
    source: JOURNEY_POINTS_SOURCE,
    layout: {
      'text-field': ['get', 'number'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  })
}

export interface JourneyPathState {
  /** Full geometry for segments already traveled. */
  done: { index: number; coords: Position[] }[]
  /** The currently-animating segment's partial geometry, if any. */
  active?: { index: number; coords: Position[] }
  /** Full geometry for untraveled segments (dashed preview). */
  future: { index: number; coords: Position[] }[]
}

export function setJourneyPath(map: MapLibreMap, state: JourneyPathState) {
  const features: Feature<LineString>[] = []
  const push = (coords: Position[], s: string, index: number) =>
    features.push({
      type: 'Feature',
      properties: { state: s, index },
      geometry: { type: 'LineString', coordinates: coords },
    })
  for (const seg of state.done) push(seg.coords, 'done', seg.index)
  if (state.active) push(state.active.coords, 'active', state.active.index)
  for (const seg of state.future) push(seg.coords, 'future', seg.index)
  map.getSource<GeoJSONSource>(JOURNEY_PATH_SOURCE)?.setData({ type: 'FeatureCollection', features })
}

export function setWaypointVisited(map: MapLibreMap, waypointId: string, visited: boolean) {
  map.setFeatureState({ source: JOURNEY_POINTS_SOURCE, id: waypointId }, { visited })
}

export function removeJourneyLayers(map: MapLibreMap) {
  for (const layer of JOURNEY_LAYERS) {
    if (map.getLayer(layer)) map.removeLayer(layer)
  }
  for (const source of [JOURNEY_PATH_SOURCE, JOURNEY_POINTS_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source)
  }
}
