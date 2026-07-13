import type { Feature, LineString, Point, Position } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { angularDistanceRad, arcForEntry } from '../data/arcs'
import { addTourLayers, removeTourLayers, setTourArcs, setTourPoints } from './tourLayers'
import type { TourStop } from './roster'

export type TourStatus = 'idle' | 'playing' | 'paused'
export type TourSpeed = 0.5 | 1 | 2

export interface TourCallbacks {
  /** Current stop while its card should be visible; null while flying. */
  onStop(stop: TourStop | null): void
  /** Tour year advanced — the app maps this to the era filter. */
  onYear(year: number): void
  onStatus(status: TourStatus): void
  onEnd(reason: 'finished' | 'cancelled'): void
}

const REVEAL_MS = 1500
const DWELL_MS = 2800
const FLY_MIN_MS = 1800
const FLY_MAX_MS = 3200
const EARTH_KM = 6371
const YEAR_EMIT_INTERVAL_MS = 100

type Phase = 'flying' | 'revealing' | 'dwelling'

interface ActiveArc {
  entryId: string
  coords: Position[]
  color: string
  deathPoint: Position
}

/**
 * Single-use cinematic tour driver. One rAF loop with a virtual clock:
 * pause stops the clock, speed rescales it. Phases are timed purely on the
 * clock — never on 'moveend', which fires spuriously on map.stop() and on
 * drag-interrupted flights.
 */
export class TourEngine {
  private status: TourStatus = 'idle'
  private phase: Phase = 'flying'
  private phaseBudget = 1
  private virtualMs = 0
  private lastReal = 0
  private speed: TourSpeed = 1
  private stopIndex = -1
  private raf = 0
  private destroyed = false
  private doneArcs: Feature<LineString>[] = []
  private activeArcs: ActiveArc[] = []
  private lastYear = Number.NaN
  private lastYearEmitReal = 0
  private yearFrom: number
  private yearTo: number

  constructor(
    private readonly map: MapLibreMap,
    private readonly stops: TourStop[],
    minYear: number,
    private readonly cb: TourCallbacks,
  ) {
    this.yearFrom = minYear
    this.yearTo = minYear
  }

  play() {
    if (this.destroyed || this.stops.length === 0) return
    if (this.status === 'paused') {
      this.resume()
      return
    }
    if (this.status === 'playing') return
    addTourLayers(this.map)
    this.map.on('dragstart', this.onGesture)
    this.map.on('wheel', this.onGesture)
    this.setStatus('playing')
    this.lastReal = performance.now()
    this.beginNextStop()
    this.raf = requestAnimationFrame(this.tick)
  }

  pause() {
    if (this.destroyed || this.status !== 'playing') return
    if (this.phase === 'flying') this.map.stop() // freeze camera mid-flight
    this.setStatus('paused')
  }

  resume() {
    if (this.destroyed || this.status !== 'paused') return
    this.setStatus('playing')
    this.lastReal = performance.now()
    if (this.phase === 'flying') this.reissueFlight()
  }

  setSpeed(speed: TourSpeed) {
    if (this.destroyed || speed === this.speed) return
    this.speed = speed
    if (this.status === 'playing' && this.phase === 'flying') this.reissueFlight()
  }

  /** Full cancel: camera, timers, listeners, layers. Safe to call twice. */
  stop() {
    this.destroy('cancelled')
  }

  private tick = (now: number) => {
    if (this.destroyed) return
    if (this.status === 'playing') this.virtualMs += (now - this.lastReal) * this.speed
    this.lastReal = now
    this.advance(now)
    if (!this.destroyed) this.raf = requestAnimationFrame(this.tick)
  }

  private advance(nowReal: number) {
    if (this.status !== 'playing') return
    const t = Math.min(1, this.virtualMs / this.phaseBudget)
    switch (this.phase) {
      case 'flying': {
        this.emitYear(Math.round(this.yearFrom + (this.yearTo - this.yearFrom) * t), nowReal)
        if (this.virtualMs >= this.phaseBudget) this.beginReveal()
        break
      }
      case 'revealing': {
        this.renderArcs(t)
        if (this.virtualMs >= this.phaseBudget) {
          this.phase = 'dwelling'
          this.virtualMs = 0
          this.phaseBudget = DWELL_MS
        }
        break
      }
      case 'dwelling': {
        if (this.virtualMs >= this.phaseBudget) this.beginNextStop()
        break
      }
    }
  }

  private beginNextStop() {
    this.commitActiveArcs()
    this.stopIndex++
    const stop = this.stops[this.stopIndex]
    if (!stop) {
      this.destroy('finished')
      return
    }
    this.cb.onStop(null)
    this.phase = 'flying'
    this.virtualMs = 0
    this.yearFrom = this.stopIndex === 0 ? this.yearTo : this.stops[this.stopIndex - 1]!.year
    this.yearTo = stop.year
    const from = this.map.getCenter()
    const distKm = angularDistanceRad([from.lng, from.lat], stop.center) * EARTH_KM
    this.phaseBudget = Math.min(FLY_MAX_MS, Math.max(FLY_MIN_MS, FLY_MIN_MS + distKm / 8))
    this.flyToStop(stop, this.phaseBudget / this.speed)
  }

  private beginReveal() {
    const stop = this.stops[this.stopIndex]!
    this.phase = 'revealing'
    this.virtualMs = 0
    this.phaseBudget = REVEAL_MS
    this.emitYear(stop.year, Number.POSITIVE_INFINITY)
    this.cb.onStop(stop)

    this.activeArcs = []
    for (const entry of stop.entries) {
      const coords = arcForEntry(entry)
      if (coords) {
        this.activeArcs.push({
          entryId: entry.id,
          coords,
          color: stop.color,
          deathPoint: coords[coords.length - 1]!,
        })
      }
    }
    setTourPoints(this.map, {
      type: 'FeatureCollection',
      features: stop.entries.map((entry) => ({
        type: 'Feature' as const,
        properties: { id: entry.id, color: stop.color, state: 'drawing' },
        geometry: { type: 'Point' as const, coordinates: [entry.lng, entry.lat] },
      })),
    })
    this.renderArcs(0)
  }

  private renderArcs(t: number) {
    if (this.activeArcs.length === 0) return
    const features: Feature<LineString>[] = [...this.doneArcs]
    for (const arc of this.activeArcs) {
      features.push({
        type: 'Feature',
        properties: { id: arc.entryId, color: arc.color, state: 'drawing' },
        geometry: { type: 'LineString', coordinates: partialLine(arc.coords, t) },
      })
    }
    setTourArcs(this.map, { type: 'FeatureCollection', features })

    if (t >= 1) {
      // Arc has landed: also mark the death point.
      const stop = this.stops[this.stopIndex]!
      const points: Feature<Point>[] = stop.entries.map((entry) => ({
        type: 'Feature' as const,
        properties: { id: entry.id, color: stop.color, state: 'drawing' },
        geometry: { type: 'Point' as const, coordinates: [entry.lng, entry.lat] },
      }))
      for (const arc of this.activeArcs) {
        points.push({
          type: 'Feature',
          properties: { id: `${arc.entryId}-death`, color: arc.color, state: 'drawing' },
          geometry: { type: 'Point', coordinates: arc.deathPoint },
        })
      }
      setTourPoints(this.map, { type: 'FeatureCollection', features: points })
    }
  }

  private commitActiveArcs() {
    for (const arc of this.activeArcs) {
      this.doneArcs.push({
        type: 'Feature',
        properties: { id: arc.entryId, color: arc.color, state: 'done' },
        geometry: { type: 'LineString', coordinates: arc.coords },
      })
    }
    this.activeArcs = []
    if (this.doneArcs.length > 0) {
      setTourArcs(this.map, { type: 'FeatureCollection', features: this.doneArcs })
    }
  }

  private flyToStop(stop: TourStop, durationMs: number) {
    // Unwrap the target longitude so MapLibre takes the short way (never
    // crossing half the planet because of a ±360 discontinuity).
    let lng = stop.center[0]
    const current = this.map.getCenter().lng
    while (lng - current > 180) lng -= 360
    while (lng - current < -180) lng += 360
    this.map.flyTo({
      center: [lng, stop.center[1]],
      zoom: stop.zoom,
      bearing: 0,
      pitch: 0,
      curve: 1.25,
      padding: { bottom: 140 },
      duration: Math.max(600, durationMs),
    })
  }

  private reissueFlight() {
    const stop = this.stops[this.stopIndex]
    if (!stop) return
    const remaining = Math.max(600, (this.phaseBudget - this.virtualMs) / this.speed)
    this.flyToStop(stop, remaining)
  }

  private emitYear(year: number, nowReal: number) {
    if (year === this.lastYear) return
    if (nowReal - this.lastYearEmitReal < YEAR_EMIT_INTERVAL_MS) return
    this.lastYear = year
    this.lastYearEmitReal = nowReal === Number.POSITIVE_INFINITY ? this.lastYearEmitReal : nowReal
    this.cb.onYear(year)
  }

  private setStatus(status: TourStatus) {
    this.status = status
    this.cb.onStatus(status)
  }

  private destroy(reason: 'finished' | 'cancelled') {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.map.off('dragstart', this.onGesture)
    this.map.off('wheel', this.onGesture)
    try {
      this.map.stop()
      removeTourLayers(this.map)
    } catch {
      // map may already be destroyed
    }
    this.status = 'idle'
    this.cb.onStatus('idle')
    this.cb.onStop(null)
    this.cb.onEnd(reason)
  }

  private onGesture = () => this.pause()
}

/** First `t` fraction of a line, with a fractionally interpolated tip for 60fps smoothness. */
function partialLine(coords: Position[], t: number): Position[] {
  if (t >= 1) return coords
  const n = Math.max(1e-6, t) * (coords.length - 1)
  const k = Math.floor(n)
  const partial = coords.slice(0, k + 1)
  if (k < coords.length - 1) {
    const frac = n - k
    const a = coords[k]!
    const b = coords[k + 1]!
    partial.push([a[0]! + (b[0]! - a[0]!) * frac, a[1]! + (b[1]! - a[1]!) * frac])
  }
  return partial
}
