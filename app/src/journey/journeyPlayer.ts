import type { Journey } from '@pev/shared'
import type { Position } from 'geojson'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { angularDistanceRad } from '../data/arcs'
import {
  addJourneyLayers,
  journeySegments,
  removeJourneyLayers,
  setJourneyPath,
  setWaypointVisited,
  type JourneyPathState,
} from './journeyLayers'

export interface JourneyPlayerCallbacks {
  onWaypoint(index: number): void
  onAutoplay(on: boolean): void
}

const SEGMENT_DRAW_MS = 1600
const AUTOPLAY_DWELL_MS = 12_000
const EARTH_KM = 6371
const WAYPOINT_ZOOM = 5.2

/**
 * Manual-first journey navigation: goTo/next/prev fly the camera and animate
 * the traveled segment; optional autoplay advances after a reading-paced dwell.
 * Single-use per journey; destroy() tears everything down.
 */
export class JourneyPlayer {
  private index = -1
  private segments: (Position[] | null)[]
  private raf = 0
  private autoplayTimer: ReturnType<typeof setTimeout> | null = null
  private autoplay = false
  private destroyed = false

  constructor(
    private readonly map: MapLibreMap,
    private readonly journey: Journey,
    private readonly cb: JourneyPlayerCallbacks,
  ) {
    this.segments = journeySegments(journey)
    addJourneyLayers(map, journey)
    this.renderPath(null)
  }

  get waypointIndex() {
    return this.index
  }

  next() {
    this.goTo(this.index + 1, { animate: true })
  }

  prev() {
    this.goTo(this.index - 1, { animate: true })
  }

  goTo(target: number, opts: { animate: boolean }) {
    if (this.destroyed) return
    const clamped = Math.max(0, Math.min(this.journey.waypoints.length - 1, target))
    if (clamped === this.index) return
    const movingForwardByOne = clamped === this.index + 1 && this.index >= 0
    this.clearAutoplayTimer()
    cancelAnimationFrame(this.raf)

    this.index = clamped
    for (let i = 0; i < this.journey.waypoints.length; i++) {
      setWaypointVisited(this.map, this.journey.waypoints[i]!.id, i <= clamped)
    }
    this.cb.onWaypoint(clamped)

    const wp = this.journey.waypoints[clamped]!
    const flyMs = this.flyTo([wp.lng, wp.lat], opts.animate)

    if (opts.animate && movingForwardByOne && this.segments[clamped - 1]) {
      this.animateSegment(clamped - 1, Math.max(flyMs, SEGMENT_DRAW_MS))
    } else {
      this.renderPath(null)
    }
    this.scheduleAutoplay(flyMs)
  }

  setAutoplay(on: boolean) {
    if (this.destroyed) return
    this.autoplay = on
    this.cb.onAutoplay(on)
    if (on) this.scheduleAutoplay(0)
    else this.clearAutoplayTimer()
  }

  /** Pull back to frame the entire journey. */
  overview() {
    if (this.destroyed) return
    const bounds = new maplibregl.LngLatBounds()
    for (const seg of this.segments) {
      if (seg) for (const [lng, lat] of seg) bounds.extend([lng!, lat!])
    }
    for (const wp of this.journey.waypoints) bounds.extend([wp.lng, wp.lat])
    this.map.fitBounds(bounds, { padding: this.cameraPadding(80), duration: 1600 })
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.clearAutoplayTimer()
    try {
      this.map.stop()
      removeJourneyLayers(this.map)
    } catch {
      // map may already be gone
    }
  }

  // --- internals ---------------------------------------------------------

  private flyTo(center: [number, number], animate: boolean): number {
    let lng = center[0]
    const current = this.map.getCenter().lng
    while (lng - current > 180) lng -= 360
    while (lng - current < -180) lng += 360
    if (!animate) {
      this.map.jumpTo({ center: [lng, center[1]], zoom: WAYPOINT_ZOOM, padding: this.cameraPadding(40) })
      return 0
    }
    const distKm = angularDistanceRad([current, this.map.getCenter().lat], center) * EARTH_KM
    const duration = Math.min(3200, Math.max(1600, 1600 + distKm / 8))
    this.map.flyTo({
      center: [lng, center[1]],
      zoom: WAYPOINT_ZOOM,
      bearing: 0,
      pitch: 0,
      curve: 1.25,
      padding: this.cameraPadding(40),
      duration,
    })
    return duration
  }

  /** Keep the waypoint clear of the journey panel (right on desktop, bottom on mobile). */
  private cameraPadding(base: number) {
    const narrow = window.innerWidth <= 640
    return {
      top: base,
      left: base,
      right: narrow ? base : base + 360,
      bottom: narrow ? base + 240 : base + 60,
    }
  }

  private animateSegment(segIndex: number, durationMs: number) {
    const coords = this.segments[segIndex]!
    const start = performance.now()
    const tick = (now: number) => {
      if (this.destroyed) return
      const t = Math.min(1, (now - start) / durationMs)
      this.renderPath({ index: segIndex, t })
      if (t < 1) this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private renderPath(animating: { index: number; t: number } | null) {
    const state: JourneyPathState = { done: [], future: [] }
    for (let i = 0; i < this.segments.length; i++) {
      const coords = this.segments[i]
      if (!coords) continue
      if (animating && i === animating.index) {
        state.active = { index: i, coords: partial(coords, animating.t) }
      } else if (i < this.index) {
        state.done.push({ index: i, coords })
      } else {
        state.future.push({ index: i, coords })
      }
    }
    setJourneyPath(this.map, state)
  }

  private scheduleAutoplay(afterMs: number) {
    this.clearAutoplayTimer()
    if (!this.autoplay || this.destroyed) return
    if (this.index >= this.journey.waypoints.length - 1) {
      this.setAutoplay(false) // reached the end
      return
    }
    this.autoplayTimer = setTimeout(() => this.next(), afterMs + AUTOPLAY_DWELL_MS)
  }

  private clearAutoplayTimer() {
    if (this.autoplayTimer !== null) {
      clearTimeout(this.autoplayTimer)
      this.autoplayTimer = null
    }
  }
}

function partial(coords: Position[], t: number): Position[] {
  if (t >= 1) return coords
  const n = Math.max(1e-6, t) * (coords.length - 1)
  const k = Math.floor(n)
  const out = coords.slice(0, k + 1)
  if (k < coords.length - 1) {
    const frac = n - k
    const a = coords[k]!
    const b = coords[k + 1]!
    out.push([a[0]! + (b[0]! - a[0]!) * frac, a[1]! + (b[1]! - a[1]!) * frac])
  }
  return out
}
