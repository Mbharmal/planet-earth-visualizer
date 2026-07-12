import type { ViewEntry, ViewManifest } from '@pev/shared'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { entriesToGeoJSON } from '../data/geojson'

export const VIEW_SOURCE = 'view'
export const LAYER_POINTS = 'view-points'

/** Replace whatever view is on the map with the given one. */
export function setViewOnMap(map: MapLibreMap, manifest: ViewManifest, entries: ViewEntry[]) {
  removeViewFromMap(map)

  map.addSource(VIEW_SOURCE, {
    type: 'geojson',
    data: entriesToGeoJSON(entries),
    promoteId: 'id',
  })

  map.addLayer({
    id: LAYER_POINTS,
    type: 'circle',
    source: VIEW_SOURCE,
    paint: {
      'circle-radius': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        (manifest.pointStyle?.radius ?? 6) + 3,
        manifest.pointStyle?.radius ?? 6,
      ],
      'circle-color': manifest.color,
      'circle-stroke-color': manifest.pointStyle?.strokeColor ?? '#ffffff',
      'circle-stroke-width': 1.5,
    },
  })
}

export function removeViewFromMap(map: MapLibreMap) {
  if (map.getLayer(LAYER_POINTS)) map.removeLayer(LAYER_POINTS)
  if (map.getSource(VIEW_SOURCE)) map.removeSource(VIEW_SOURCE)
}
