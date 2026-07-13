import type maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArcsToggle } from './components/ArcsToggle'
import { ClusterList } from './components/ClusterList'
import { InfoCard } from './components/InfoCard'
import { LoadingOverlay } from './components/LoadingOverlay'
import { TimelineBar } from './components/TimelineBar'
import { TitleBadge } from './components/TitleBadge'
import { TourCard } from './components/TourCard'
import { ViewSwitcher } from './components/ViewSwitcher'
import { entryYear } from './data/geojson'
import { useViewData } from './data/useViewData'
import { useViewIndex } from './data/useViewIndex'
import { parseHash, writeHash } from './hash'
import { wireViewInteractions, type ClusterSelection } from './map/interactions'
import { MapView } from './map/MapView'
import { removeViewFromMap, setArcsVisible, setViewOnMap, updateViewData } from './map/viewLayers'
import { useTour } from './tour/useTour'

const initialHash = parseHash()

export default function App() {
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [activeViewId, setActiveViewId] = useState<string | null>(initialHash.view ?? null)
  const [selectedId, setSelectedId] = useState<string | null>(initialHash.entry ?? null)
  const [cluster, setCluster] = useState<ClusterSelection | null>(null)
  const [eraRange, setEraRange] = useState<[number, number] | null>(initialHash.era ?? null)
  const [showArcs, setShowArcs] = useState(initialHash.arcs ?? false)

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
  const entries = viewState.status === 'ready' ? viewState.data.entries : []

  // Year bounds of the active view (null when no entry has a known birth year).
  const yearBounds = useMemo<[number, number] | null>(() => {
    const years = entries.map(entryYear).filter((y): y is number => y !== null)
    if (years.length === 0) return null
    return [Math.min(...years), Math.max(...years)]
  }, [entries])

  // --- Cinematic tour ---------------------------------------------------
  const tourSnapshot = useRef<{ era: [number, number] | null; arcs: boolean }>({ era: null, arcs: false })
  const tour = useTour(map, entries, {
    onStart: () => {
      tourSnapshot.current = { era: eraRange, arcs: showArcs }
      setSelectedId(null)
      setCluster(null)
      if (map) setArcsVisible(map, false) // static arcs would compete with traced journeys
    },
    onYear: (year) => {
      if (yearBounds) setEraRange([yearBounds[0], year])
    },
    onEnd: () => {
      setEraRange(tourSnapshot.current.era)
      setShowArcs(tourSnapshot.current.arcs)
      if (map) setArcsVisible(map, tourSnapshot.current.arcs)
    },
  })
  const touring = tour.status !== 'idle'

  // Keep the URL hash shareable. Era is suppressed during a tour (transient state).
  useEffect(() => {
    writeHash({
      view: activeViewId ?? undefined,
      entry: selectedId ?? undefined,
      era: touring ? undefined : (eraRange ?? undefined),
      arcs: showArcs || undefined,
    })
  }, [activeViewId, selectedId, eraRange, showArcs, touring])

  // Support back/forward navigation and externally-set hashes.
  useEffect(() => {
    const onHashChange = () => {
      tour.cancel()
      const hash = parseHash()
      if (hash.view) setActiveViewId(hash.view)
      setSelectedId(hash.entry ?? null)
      setEraRange(hash.era ?? null)
      setShowArcs(hash.arcs ?? false)
      setCluster(null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Era-filtered entries. Entries without a year are hidden while a filter is active.
  const filteredEntries = useMemo(() => {
    if (!eraRange) return entries
    const [from, to] = eraRange
    return entries.filter((entry) => {
      const year = entryYear(entry)
      return year !== null && year >= from && year <= to
    })
  }, [entries, eraRange])

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

  // Era filter / tour year: swap the source data in place (re-clusters correctly).
  useEffect(() => {
    if (!map || viewState.status !== 'ready') return
    updateViewData(map, filteredEntries)
  }, [map, viewState, filteredEntries])

  // Static migration-arcs visibility (layer is rebuilt on view switch; hidden while touring).
  useEffect(() => {
    if (!map || viewState.status !== 'ready') return
    setArcsVisible(map, showArcs && !touring)
  }, [map, viewState, showArcs, touring])

  const selected = useMemo(() => entries.find((entry) => entry.id === selectedId) ?? null, [entries, selectedId])
  const clusterEntries = useMemo(
    () => (cluster ? cluster.entryIds.map((id) => entries.find((e) => e.id === id)).filter((e) => e !== undefined) : []),
    [cluster, entries],
  )

  // The cluster popover is anchored to a screen point; close it when the map moves.
  useEffect(() => {
    if (!map || !cluster) return
    const close = () => setCluster(null)
    map.on('movestart', close)
    return () => {
      map.off('movestart', close)
    }
  }, [map, cluster])

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
    tour.cancel() // must run before the view effect re-adds base layers
    setSelectedId(null)
    setCluster(null)
    setEraRange(null)
    setActiveViewId(viewId)
  }

  const cycleSpeed = () => {
    const next = tour.speed === 0.5 ? 1 : tour.speed === 1 ? 2 : 0.5
    tour.setSpeed(next)
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
      {viewState.status === 'ready' && !touring && (
        <ArcsToggle
          active={showArcs}
          accentColor={viewState.data.manifest.color}
          onToggle={() => setShowArcs((v) => !v)}
        />
      )}
      {yearBounds && viewState.status === 'ready' && (
        <TimelineBar
          minYear={yearBounds[0]}
          maxYear={yearBounds[1]}
          range={eraRange}
          tour={{ status: tour.status, speed: tour.speed, progress: tour.progress }}
          onRangeChange={setEraRange}
          onTourToggle={tour.toggle}
          onTourStop={tour.cancel}
          onSpeedCycle={cycleSpeed}
        />
      )}
      {tour.stop && <TourCard stop={tour.stop} onExpand={tour.pause} />}
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
      {selected && viewState.status === 'ready' && !touring && (
        <InfoCard entry={selected} accentColor={viewState.data.manifest.color} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
