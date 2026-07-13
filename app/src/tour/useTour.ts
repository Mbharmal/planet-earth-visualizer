import type { ViewEntry } from '@pev/shared'
import type maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildTourStops, selectRoster, type TourStop } from './roster'
import { TourEngine, type TourSpeed, type TourStatus } from './tourEngine'

export interface TourHooks {
  /** Called right before the tour starts — snapshot state to restore later. */
  onStart(): void
  onYear(year: number): void
  /** Called after the engine has fully torn down — restore snapshotted state. */
  onEnd(reason: 'finished' | 'cancelled'): void
}

export interface TourHandle {
  status: TourStatus
  stop: TourStop | null
  progress: { index: number; total: number } | null
  speed: TourSpeed
  start(): void
  toggle(): void
  pause(): void
  setSpeed(speed: TourSpeed): void
  cancel(): void
}

/** Thin React binding for TourEngine. The engine is created per start() and is single-use. */
export function useTour(
  map: maplibregl.Map | null,
  entries: ViewEntry[],
  hooks: TourHooks,
): TourHandle {
  const engineRef = useRef<TourEngine | null>(null)
  const [status, setStatus] = useState<TourStatus>('idle')
  const [stop, setStop] = useState<TourStop | null>(null)
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null)
  const [speed, setSpeedState] = useState<TourSpeed>(1)

  // Keep latest callbacks/data without re-creating handlers (stale-closure guard).
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  // Tear down on unmount or map swap.
  useEffect(() => {
    return () => {
      engineRef.current?.stop()
      engineRef.current = null
    }
  }, [map])

  const start = useCallback(() => {
    if (!map || engineRef.current) return
    const roster = selectRoster(entriesRef.current)
    const stops = buildTourStops(roster)
    if (stops.length === 0) return
    const minYear = stops[0]!.year

    hooksRef.current.onStart()
    const engine = new TourEngine(map, stops, minYear, {
      onStop: (s) => {
        setStop(s)
        if (s) setProgress({ index: s.index + 1, total: stops.length })
      },
      onYear: (year) => hooksRef.current.onYear(year),
      onStatus: setStatus,
      onEnd: (reason) => {
        engineRef.current = null
        setStop(null)
        setProgress(null)
        setSpeedState(1)
        hooksRef.current.onEnd(reason)
      },
    })
    engineRef.current = engine
    engine.play()
  }, [map])

  const toggle = useCallback(() => {
    const engine = engineRef.current
    if (!engine) {
      start()
      return
    }
    if (status === 'playing') engine.pause()
    else engine.play()
  }, [start, status])

  const pause = useCallback(() => {
    engineRef.current?.pause()
  }, [])

  const setSpeed = useCallback((s: TourSpeed) => {
    engineRef.current?.setSpeed(s)
    setSpeedState(s)
  }, [])

  const cancel = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
  }, [])

  return { status, stop, progress, speed, start, toggle, pause, setSpeed, cancel }
}
