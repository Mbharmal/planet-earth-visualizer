import type { ViewEntry } from '@pev/shared'
import type { FeatureCollection, LineString, Position } from 'geojson'

/** Skip arcs shorter than this (death in the same city renders as noise). */
const MIN_ARC_RADIANS = 40 / 6371 // ≈ 40 km

const STEPS = 48

function toVec(lng: number, lat: number): [number, number, number] {
  const φ = (lat * Math.PI) / 180
  const λ = (lng * Math.PI) / 180
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)]
}

/** Great-circle interpolation between two points; longitudes unwrapped so the
 *  line never jumps across the antimeridian. */
export function greatCircle(from: [number, number], to: [number, number]): Position[] | null {
  const a = toVec(from[0], from[1])
  const b = toVec(to[0], to[1])
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const ω = Math.acos(dot)
  if (ω < MIN_ARC_RADIANS) return null

  const sinω = Math.sin(ω)
  const points: Position[] = []
  let prevLng = from[0]
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const s1 = Math.sin((1 - t) * ω) / sinω
    const s2 = Math.sin(t * ω) / sinω
    const x = s1 * a[0] + s2 * b[0]
    const y = s1 * a[1] + s2 * b[1]
    const z = s1 * a[2] + s2 * b[2]
    let lng = (Math.atan2(y, x) * 180) / Math.PI
    const lat = (Math.asin(Math.min(1, Math.max(-1, z))) * 180) / Math.PI
    // Unwrap: keep consecutive longitudes within ±180 of each other.
    while (lng - prevLng > 180) lng -= 360
    while (lng - prevLng < -180) lng += 360
    prevLng = lng
    points.push([lng, lat])
  }
  return points
}

/** Birth→death arcs for every entry that has death coordinates. */
export function entriesToArcsGeoJSON(entries: ViewEntry[]): FeatureCollection<LineString> {
  const features = []
  for (const entry of entries) {
    if (entry.deathLat === undefined || entry.deathLng === undefined) continue
    const line = greatCircle([entry.lng, entry.lat], [entry.deathLng, entry.deathLat])
    if (!line) continue
    features.push({
      type: 'Feature' as const,
      properties: { id: entry.id, name: entry.name },
      geometry: { type: 'LineString' as const, coordinates: line },
    })
  }
  return { type: 'FeatureCollection', features }
}
