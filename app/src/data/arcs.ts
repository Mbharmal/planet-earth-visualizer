import type { ViewEntry } from '@pev/shared'
import type { FeatureCollection, LineString, Position } from 'geojson'

/** Skip arcs shorter than this (death in the same city renders as noise). */
const MIN_ARC_RADIANS = 40 / 6371 // ≈ 40 km

const STEPS = 48

type Vec3 = [number, number, number]

function toVec(lng: number, lat: number): Vec3 {
  const φ = (lat * Math.PI) / 180
  const λ = (lng * Math.PI) / 180
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)]
}

function vecToLngLat(v: Vec3): [number, number] {
  const lng = (Math.atan2(v[1], v[0]) * 180) / Math.PI
  const lat = (Math.asin(Math.min(1, Math.max(-1, v[2]))) * 180) / Math.PI
  return [lng, lat]
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  return len > 0 ? scale(v, 1 / len) : v
}

const angleBetween = (a: Vec3, b: Vec3): number => Math.acos(Math.min(1, Math.max(-1, dot(a, b))))

/** Central angle between two lng/lat points, in radians. Multiply by 6371 for km. */
export function angularDistanceRad(a: [number, number], b: [number, number]): number {
  return angleBetween(toVec(a[0], a[1]), toVec(b[0], b[1]))
}

/** Spherical linear interpolation between unit vectors (stays on the sphere). */
function slerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  const ω = angleBetween(a, b)
  if (ω < 1e-9) return a
  const s = Math.sin(ω)
  return add(scale(a, Math.sin((1 - t) * ω) / s), scale(b, Math.sin(t * ω) / s))
}

/**
 * Bowed arc between two points: a spherical quadratic Bézier (de Casteljau over
 * slerps) through a control point — the great-circle midpoint rotated toward
 * the circle's poleward normal by δ = min(0.10, ω·0.22). Short arcs get a
 * visible curve instead of reading as straight ticks; long arcs stay close to
 * the honest great circle. All math stays exactly on the sphere.
 * Longitudes are unwrapped so the line never jumps across the antimeridian.
 */
export function bowedArc(from: [number, number], to: [number, number]): Position[] | null {
  const a = toVec(from[0], from[1])
  const b = toVec(to[0], to[1])
  const ω = angleBetween(a, b)
  if (ω < MIN_ARC_RADIANS) return null

  const mid = normalize(add(a, b))
  let pole = normalize(cross(a, b))
  if (pole[2] < 0) pole = scale(pole, -1) // consistent poleward bow
  const δ = Math.min(0.1, ω * 0.22)
  const ctrl = add(scale(mid, Math.cos(δ)), scale(pole, Math.sin(δ))) // mid rotated toward pole (orthonormal pair)

  const points: Position[] = []
  let prevLng = from[0]
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const p = normalize(slerpVec(slerpVec(a, ctrl, t), slerpVec(ctrl, b, t), t))
    let [lng, lat] = vecToLngLat(p)
    while (lng - prevLng > 180) lng -= 360
    while (lng - prevLng < -180) lng += 360
    prevLng = lng
    points.push([lng, lat])
  }
  return points
}

/**
 * A small closed "petal" loop at a point — the tour's mark for someone who
 * died where they were born. Built by rotating the point around the axis of a
 * circle center offset poleward (Rodrigues rotation), so it starts and ends
 * exactly at the point.
 */
export function selfLoop(at: [number, number], radiusKm = 85): Position[] {
  const p = toVec(at[0], at[1])
  const r = radiusKm / 6371 // radians
  // Circle center: point rotated toward the north pole by r (southern
  // hemisphere gets a southward petal, which reads identically).
  const northish: Vec3 = at[1] > 80 ? [1, 0, 0] : [0, 0, 1]
  const axisEast = normalize(cross(northish, p))
  const toward = normalize(cross(p, axisEast)) // unit vector at p toward the pole
  const center = normalize(add(scale(p, Math.cos(r)), scale(toward, Math.sin(r))))

  const points: Position[] = []
  let prevLng = at[0]
  const STEPS_LOOP = 36
  for (let i = 0; i <= STEPS_LOOP; i++) {
    const θ = (i / STEPS_LOOP) * 2 * Math.PI
    // Rodrigues rotation of p around the axis through `center`.
    const k = center
    const cosθ = Math.cos(θ)
    const sinθ = Math.sin(θ)
    const kxp = cross(k, p)
    const kdp = dot(k, p)
    const rotated: Vec3 = [
      p[0] * cosθ + kxp[0] * sinθ + k[0] * kdp * (1 - cosθ),
      p[1] * cosθ + kxp[1] * sinθ + k[1] * kdp * (1 - cosθ),
      p[2] * cosθ + kxp[2] * sinθ + k[2] * kdp * (1 - cosθ),
    ]
    let [lng, lat] = vecToLngLat(normalize(rotated))
    while (lng - prevLng > 180) lng -= 360
    while (lng - prevLng < -180) lng += 360
    prevLng = lng
    points.push([lng, lat])
  }
  return points
}

/** The bowed birth→death arc for one entry, or null when not applicable. */
export function arcForEntry(entry: ViewEntry): Position[] | null {
  if (entry.deathLat === undefined || entry.deathLng === undefined) return null
  return bowedArc([entry.lng, entry.lat], [entry.deathLng, entry.deathLat])
}

/** True when the entry has death coordinates essentially at its birthplace. */
export function diedWhereBorn(entry: ViewEntry): boolean {
  if (entry.deathLat === undefined || entry.deathLng === undefined) return false
  return angularDistanceRad([entry.lng, entry.lat], [entry.deathLng, entry.deathLat]) < MIN_ARC_RADIANS
}

/** Birth→death arcs for every entry that has death coordinates. */
export function entriesToArcsGeoJSON(entries: ViewEntry[]): FeatureCollection<LineString> {
  const features = []
  for (const entry of entries) {
    const line = arcForEntry(entry)
    if (!line) continue
    features.push({
      type: 'Feature' as const,
      properties: { id: entry.id, name: entry.name },
      geometry: { type: 'LineString' as const, coordinates: line },
    })
  }
  return { type: 'FeatureCollection', features }
}
