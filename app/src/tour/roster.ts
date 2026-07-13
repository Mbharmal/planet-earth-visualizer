import type { ViewEntry } from '@pev/shared'
import { angularDistanceRad } from '../data/arcs'
import { entryYear } from '../data/geojson'

/**
 * Per-journey categorical palette, cycled per stop. Validated with the dataviz
 * palette checker against the light basemap surface (worst adjacent CVD ΔE 37.7;
 * sub-3:1 slots are relieved by white dot strokes + the named face card).
 * Deliberately excludes the view-identity blues.
 */
export const TOUR_PALETTE = ['#1baf7a', '#eda100', '#e34948', '#4a3aa7', '#e87ba4', '#008300']

const BUCKET_DEG = 15 // ≈1650 km × 1180 km buckets at 45°N
const BUCKET_CAP = 6
const MERGE_YEARS = 5
const MERGE_KM = 500
const MAX_STOP_SIZE = 3
const EARTH_KM = 6371

export interface TourStop {
  index: number
  /** Anchor birth year of the stop. */
  year: number
  /** 1–3 figures born close together in time and space. */
  entries: ViewEntry[]
  center: [number, number] // [lng, lat]
  zoom: number
  color: string
}

/**
 * Pick the ~`target` most important figures: greedy by fame with a cap per
 * 15° grid bucket so one region can't monopolize; a second pass ignores caps
 * when the view is too sparse to fill the target otherwise.
 */
export function selectRoster(entries: ViewEntry[], target = 40): ViewEntry[] {
  const dated = entries.filter((e) => entryYear(e) !== null)
  const withImage = dated.filter((e) => e.card.image)
  // Face cards need faces — require an image when there are plenty, else just penalize.
  const pool = withImage.length >= target * 2 ? withImage : dated
  const score = (e: ViewEntry) => (e.fame ?? 0) * (e.card.image ? 1 : 0.7)
  const sorted = [...pool].sort((a, b) => score(b) - score(a))

  const picked: ViewEntry[] = []
  const bucketCounts = new Map<string, number>()
  for (const entry of sorted) {
    if (picked.length >= target) break
    const key = `${Math.floor(entry.lat / BUCKET_DEG)},${Math.floor(entry.lng / BUCKET_DEG)}`
    const count = bucketCounts.get(key) ?? 0
    if (count >= BUCKET_CAP) continue
    bucketCounts.set(key, count + 1)
    picked.push(entry)
  }
  if (picked.length < target) {
    const chosen = new Set(picked)
    for (const entry of sorted) {
      if (picked.length >= target) break
      if (!chosen.has(entry)) picked.push(entry)
    }
  }
  return picked
}

/**
 * Chronological camera stops: figures born within MERGE_YEARS and MERGE_KM of
 * a stop's anchor share it (max 3). Longitudes are unwrapped before centroid
 * averaging so stops near the antimeridian don't average to the wrong side.
 */
export function buildTourStops(roster: ViewEntry[]): TourStop[] {
  const sorted = [...roster].sort((a, b) => entryYear(a)! - entryYear(b)!)
  const consumed = new Set<string>()
  const stops: TourStop[] = []

  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i]!
    if (consumed.has(anchor.id)) continue
    consumed.add(anchor.id)
    const anchorYear = entryYear(anchor)!
    const group = [anchor]
    let cLng = anchor.lng
    let cLat = anchor.lat

    for (let j = i + 1; j < sorted.length && group.length < MAX_STOP_SIZE; j++) {
      const candidate = sorted[j]!
      if (consumed.has(candidate.id)) continue
      const year = entryYear(candidate)!
      if (year - anchorYear > MERGE_YEARS) break
      const distKm = angularDistanceRad([cLng, cLat], [candidate.lng, candidate.lat]) * EARTH_KM
      if (distKm > MERGE_KM) continue
      consumed.add(candidate.id)
      let lng = candidate.lng
      while (lng - cLng > 180) lng -= 360
      while (lng - cLng < -180) lng += 360
      cLng = (cLng * group.length + lng) / (group.length + 1)
      cLat = (cLat * group.length + candidate.lat) / (group.length + 1)
      group.push(candidate)
    }

    stops.push({
      index: stops.length,
      year: anchorYear,
      entries: group,
      center: [cLng, cLat],
      zoom: group.length > 1 ? 4.6 : 5.2,
      color: TOUR_PALETTE[stops.length % TOUR_PALETTE.length]!,
    })
  }
  return stops
}
