/** Shareable deep links: #view=scientists&entry=Q937 */

export interface HashState {
  view?: string
  entry?: string
}

export function parseHash(): HashState {
  const params = new URLSearchParams(window.location.hash.slice(1))
  return {
    view: params.get('view') ?? undefined,
    entry: params.get('entry') ?? undefined,
  }
}

export function writeHash(state: HashState) {
  const params = new URLSearchParams()
  if (state.view) params.set('view', state.view)
  if (state.entry) params.set('entry', state.entry)
  const hash = params.toString()
  history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname + window.location.search)
}
