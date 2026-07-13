import { JourneySchema, type Journey } from '@pev/shared'
import { useEffect, useState } from 'react'
import { DATASETS_BASE } from '../config'

export type JourneyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; journey: Journey }
  | { status: 'error'; message: string }

/** Fetch and validate a journey from its dataset path (e.g. "journeys/euler.json"). */
export function useJourney(path: string | null): JourneyState {
  const [state, setState] = useState<JourneyState>({ status: 'idle' })

  useEffect(() => {
    if (!path) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    fetch(`${DATASETS_BASE}/${path}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`journey fetch failed (${res.status})`)
        const journey = JourneySchema.parse(await res.json())
        if (!cancelled) setState({ status: 'ready', journey })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message =
          err instanceof Error
            ? err.name === 'ZodError' || err.name === '$ZodError'
              ? 'journey failed validation'
              : err.message
            : String(err)
        setState({ status: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return state
}
