import type maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useState } from 'react'
import { ClusterList } from './components/ClusterList'
import { InfoCard } from './components/InfoCard'
import { LoadingOverlay } from './components/LoadingOverlay'
import { TitleBadge } from './components/TitleBadge'
import { ViewSwitcher } from './components/ViewSwitcher'
import { useViewData } from './data/useViewData'
import { useViewIndex } from './data/useViewIndex'
import { parseHash, writeHash } from './hash'
import { wireViewInteractions, type ClusterSelection } from './map/interactions'
import { MapView } from './map/MapView'
import { removeViewFromMap, setViewOnMap } from './map/viewLayers'

const initialHash = parseHash()

export default function App() {
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [activeViewId, setActiveViewId] = useState<string | null>(initialHash.view ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(initialHash.entry ?? null)
  const [cluster, setCluster] = useState<ClusterSelection | null>(null)

  const indexState = useViewIndex()
  const views = indexState.status === 'ready' ? indexState.views : []

  // Default to the first view once the index arrives (unless deep-linked).
  useEffect(() => {
    if (indexState.status !== 'ready' || indexState.views.length === 0) return
    setActiveViewId((current) => {
      if (current && indexState.views.some((v) => v.id === current)) return current
      return indexState.views[0]?.id ?? null
    })
  }, [indexState])

  const activeView = views.find((v) => v.id === activeViewId) ?? null
  const viewState = useViewData(activeView?.path ?? null)

  // Keep the URL hash shareable. (replaceState doesn't fire hashchange, so no loop below.)
  useEffect(() => {
    writeHash({ view: activeViewId ?? undefined, entry: selectedId ?? undefined })
  }, [activeViewId, selectedId])

  // Support back/forward navigation and externally-set hashes.
  useEffect(() => {
    const onHashChange = () => {
      const hash = parseHash()
      if (hash.view) setActiveViewId(hash.view)
      setSelectedId(hash.entry ?? null)
      setCluster(null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Put the active view's points on the map once both map and data are ready.
  useEffect(() => {
    if (!map || viewState.status !== 'ready') return
    setViewOnMap(map, viewState.data.manifest, viewState.data.entries)
    const cleanup = wireViewInteractions(map, {
      onSelect: (id) => {
        setCluster(null)
        setSelectedId(id)
      },
      onClusterLeaves: setCluster,
    })
    return () => {
      cleanup()
      try {
        removeViewFromMap(map)
      } catch {
        // map may already be destroyed on unmount
      }
    }
  }, [map, viewState])

  // The cluster popover is anchored to a screen point; close it when the map moves.
  useEffect(() => {
    if (!map || !cluster) return
    const close = () => setCluster(null)
    map.on('movestart', close)
    return () => {
      map.off('movestart', close)
    }
  }, [map, cluster])

  const entries = viewState.status === 'ready' ? viewState.data.entries : []
  const selected = useMemo(() => entries.find((entry) => entry.id === selectedId) ?? null, [entries, selectedId])
  const clusterEntries = useMemo(
    () => (cluster ? cluster.entryIds.map((id) => entries.find((e) => e.id === id)).filter((e) => e !== undefined) : []),
    [cluster, entries],
  )

  // Fly toward a newly selected entry.
  useEffect(() => {
    if (!map || !selected) return
    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 6),
      duration: 1400,
    })
  }, [map, selected])

  const switchView = (viewId: string) => {
    if (viewId === activeViewId) return
    setSelectedId(null)
    setCluster(null)
    setActiveViewId(viewId)
  }

  return (
    <div className="app">
      <MapView onMap={setMap} onError={setMapError} />
      {mapError && (
        <div className="fatal-panel" role="alert">
          <h2>The globe couldn't start</h2>
          <p>{mapError}</p>
        </div>
      )}
      {!map && !mapError && <LoadingOverlay />}
      <TitleBadge subtitle={viewState.status === 'ready' ? viewState.data.manifest.description : undefined} />
      <ViewSwitcher
        views={views}
        activeViewId={activeViewId}
        loading={viewState.status === 'loading'}
        onSelect={switchView}
      />
      {(indexState.status === 'error' || viewState.status === 'error') && (
        <div className="error-banner">
          Failed to load {indexState.status === 'error' ? 'view index' : 'view'}:{' '}
          {indexState.status === 'error' ? indexState.message : viewState.status === 'error' ? viewState.message : ''}
        </div>
      )}
      {cluster && clusterEntries.length > 0 && (
        <ClusterList
          entries={clusterEntries}
          screen={cluster.screen}
          onSelect={(id) => {
            setCluster(null)
            setSelectedId(id)
          }}
          onClose={() => setCluster(null)}
        />
      )}
      {selected && viewState.status === 'ready' && (
        <InfoCard entry={selected} accentColor={viewState.data.manifest.color} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
