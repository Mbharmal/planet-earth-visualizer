import type { ViewEntry } from '@pev/shared'
import type { FeatureCollection, Point } from 'geojson'

/** Adapt flat view entries to the FeatureCollection MapLibre sources consume. */
export function entriesToGeoJSON(entries: ViewEntry[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: entries.map((entry) => ({
      type: 'Feature',
      properties: { id: entry.id, name: entry.name },
      geometry: { type: 'Point', coordinates: [entry.lng, entry.lat] },
    })),
  }
}
