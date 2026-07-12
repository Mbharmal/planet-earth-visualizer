import { ViewIndexSchema, type ViewSummary } from '@pev/shared'
import { useEffect, useState } from 'react'
import { DATASETS_BASE } from '../config'

export type ViewIndexState =
  | { status: 'loading' }
  | { status: 'ready'; views: ViewSummary[] }
  | { status: 'error'; message: string }

/** Discover available views at runtime from datasets/index.json. */
export function useViewIndex(): ViewIndexState {
  const [state, setState] = useState<ViewIndexState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`${DATASETS_BASE}/index.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`index fetch failed (${res.status})`)
        const index = ViewIndexSchema.parse(await res.json())
        if (!cancelled) setState({ status: 'ready', views: index.views })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
