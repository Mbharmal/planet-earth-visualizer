/** Shareable deep links: #view=scientists&entry=Q937&era=1600:1750&arcs=1 */

export interface HashState {
  view?: string
  entry?: string
  era?: [number, number]
  arcs?: boolean
  /** Active journey id, with a 1-based waypoint number for deep links. */
  journey?: string
  wp?: number
}

function parseEra(raw: string | null): [number, number] | undefined {
  if (!raw) return undefined
  // Colon separator because years can be negative ("-500:-300").
  const parts = raw.split(':').map(Number)
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return undefined
  const [a, b] = parts as [number, number]
  return a <= b ? [a, b] : [b, a]
}

export function parseHash(): HashState {
  const params = new URLSearchParams(window.location.hash.slice(1))
  return {
    view: params.get('view') ?? undefined,
    entry: params.get('entry') ?? undefined,
    era: parseEra(params.get('era')),
    arcs: params.get('arcs') === '1' || undefined,
    journey: params.get('journey') ?? undefined,
    wp: (() => {
      const raw = Number(params.get('wp'))
      return Number.isInteger(raw) && raw >= 1 ? raw : undefined
    })(),
  }
}

export function writeHash(state: HashState) {
  const params = new URLSearchParams()
  if (state.view) params.set('view', state.view)
  if (state.entry) params.set('entry', state.entry)
  if (state.era) params.set('era', `${state.era[0]}:${state.era[1]}`)
  if (state.arcs) params.set('arcs', '1')
  if (state.journey) {
    params.set('journey', state.journey)
    if (state.wp) params.set('wp', String(state.wp))
  }
  const hash = params.toString()
  history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname + window.location.search)
}
