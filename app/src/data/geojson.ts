import type { ViewEntry } from '@pev/shared'
import type { FeatureCollection, Point } from 'geojson'

/** Birth year of an entry, or null if unknown. Handles BCE dates ("-0287-01-01"). */
export function entryYear(entry: ViewEntry): number | null {
  const date = entry.card.birth?.date
  if (!date) return null
  const match = date.match(/^(-?\d+)/)
  return match ? Number(match[1]) : null
}

/** Adapt flat view entries to the FeatureCollection MapLibre sources consume. */
export function entriesToGeoJSON(entries: ViewEntry[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: entries.map((entry) => ({
      type: 'Feature',
      properties: { id: entry.id, name: entry.name, year: entryYear(entry) },
      geometry: { type: 'Point', coordinates: [entry.lng, entry.lat] },
    })),
  }
}
