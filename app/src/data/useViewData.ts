import { ViewManifestSchema, ViewPointsSchema, type ViewEntry, type ViewManifest } from '@pev/shared'
import { useEffect, useState } from 'react'
import { DATASETS_BASE } from '../config'

export interface ViewData {
  manifest: ViewManifest
  entries: ViewEntry[]
}

export type ViewDataState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: ViewData }
  | { status: 'error'; message: string }

/** Fetch and validate a view's manifest + points from its dataset path (e.g. "views/scientists"). */
export function useViewData(path: string | null): ViewDataState {
  const [state, setState] = useState<ViewDataState>({ status: 'idle' })

  useEffect(() => {
    if (!path) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })

    const base = `${DATASETS_BASE}/${path}`
    Promise.all([fetch(`${base}/manifest.json`), fetch(`${base}/points.json`)])
      .then(async ([manifestRes, pointsRes]) => {
        if (!manifestRes.ok || !pointsRes.ok) {
          throw new Error(`dataset fetch failed (${manifestRes.status}/${pointsRes.status})`)
        }
        const manifest = ViewManifestSchema.parse(await manifestRes.json())
        const entries = ViewPointsSchema.parse(await pointsRes.json())
        if (!cancelled) setState({ status: 'ready', data: { manifest, entries } })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [path])

  return state
}
