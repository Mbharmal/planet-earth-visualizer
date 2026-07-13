import type { ViewEntry, ViewManifest } from '@pev/shared'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { entriesToArcsGeoJSON } from '../data/arcs'
import { entriesToGeoJSON } from '../data/geojson'

export const VIEW_SOURCE = 'view'
export const ARCS_SOURCE = 'view-arcs-src'
export const LAYER_CLUSTERS = 'view-clusters'
export const LAYER_CLUSTER_COUNT = 'view-cluster-count'
export const LAYER_POINTS = 'view-points'
export const LAYER_LABELS = 'view-labels'
export const LAYER_ARCS = 'view-arcs'
export const LAYER_ARCS_GLOW = 'view-arcs-glow'

export const CLUSTER_MAX_ZOOM = 11

const ALL_LAYERS = [LAYER_LABELS, LAYER_CLUSTER_COUNT, LAYER_CLUSTERS, LAYER_POINTS, LAYER_ARCS, LAYER_ARCS_GLOW]
const ARC_LAYERS = [LAYER_ARCS_GLOW, LAYER_ARCS]

/** Replace whatever view is on the map with the given one. */
export function setViewOnMap(map: MapLibreMap, manifest: ViewManifest, entries: ViewEntry[]) {
  removeViewFromMap(map)

  const pointRadius = manifest.pointStyle?.radius ?? 6
  const strokeColor = manifest.pointStyle?.strokeColor ?? '#ffffff'
  const clusterColor = manifest.pointStyle?.clusterColor ?? manifest.color

  map.addSource(VIEW_SOURCE, {
    type: 'geojson',
    data: entriesToGeoJSON(entries),
    promoteId: 'id',
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
  })

  // Birth→death migration arcs, hidden until toggled. Added first so every
  // point/cluster layer draws above the lines. Glow underlay + crisp line.
  map.addSource(ARCS_SOURCE, { type: 'geojson', data: entriesToArcsGeoJSON(entries) })
  map.addLayer({
    id: LAYER_ARCS_GLOW,
    type: 'line',
    source: ARCS_SOURCE,
    layout: { visibility: 'none', 'line-cap': 'round' },
    paint: {
      'line-color': manifest.color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 4, 8, 8],
      'line-blur': 3,
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.14, 6, 0.08],
    },
  })
  map.addLayer({
    id: LAYER_ARCS,
    type: 'line',
    source: ARCS_SOURCE,
    layout: { visibility: 'none', 'line-cap': 'round' },
    paint: {
      'line-color': manifest.color,
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 8, 3],
      // Denser arcs are visible at higher zoom — fade to keep the map readable.
      'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.55, 6, 0.3],
    },
  })

  map.addLayer({
    id: LAYER_CLUSTERS,
    type: 'circle',
    source: VIEW_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColor,
      'circle-opacity': 0.85,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 19, 30, 24, 100, 30],
      'circle-stroke-color': strokeColor,
      'circle-stroke-width': 1.5,
    },
  })

  map.addLayer({
    id: LAYER_CLUSTER_COUNT,
    type: 'symbol',
    source: VIEW_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    },
  })

  map.addLayer({
    id: LAYER_POINTS,
    type: 'circle',
    source: VIEW_SOURCE,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        pointRadius + 3,
        pointRadius,
      ],
      'circle-color': manifest.color,
      'circle-stroke-color': strokeColor,
      'circle-stroke-width': 1.5,
    },
  })

  // Names next to unclustered dots. text-optional: a label losing the collision
  // fight against basemap city labels disappears, but the dot always stays.
  map.addLayer({
    id: LAYER_LABELS,
    type: 'symbol',
    source: VIEW_SOURCE,
    filter: ['!', ['has', 'point_count']],
    minzoom: 5,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 0.9],
      'text-optional': true,
    },
    paint: {
      'text-color': '#1a2138',
      'text-halo-color': 'rgba(255, 255, 255, 0.9)',
      'text-halo-width': 1.4,
    },
  })
}

/** Swap the active view's data in place (era filtering, time-lapse). Re-clusters. */
export function updateViewData(map: MapLibreMap, entries: ViewEntry[]) {
  map.getSource<GeoJSONSource>(VIEW_SOURCE)?.setData(entriesToGeoJSON(entries))
  map.getSource<GeoJSONSource>(ARCS_SOURCE)?.setData(entriesToArcsGeoJSON(entries))
}

export function setArcsVisible(map: MapLibreMap, visible: boolean) {
  for (const layer of ARC_LAYERS) {
    if (map.getLayer(layer)) {
      map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
    }
  }
}

export function removeViewFromMap(map: MapLibreMap) {
  for (const layer of ALL_LAYERS) {
    if (map.getLayer(layer)) map.removeLayer(layer)
  }
  for (const source of [VIEW_SOURCE, ARCS_SOURCE]) {
    if (map.getSource(source)) map.removeSource(source)
  }
}
