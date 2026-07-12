import type maplibregl from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { InfoCard } from './components/InfoCard'
import { useViewData } from './data/useViewData'
import { wireViewInteractions } from './map/interactions'
import { MapView } from './map/MapView'
import { removeViewFromMap, setViewOnMap } from './map/viewLayers'

export default function App() {
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const viewState = useViewData('views/scientists')

  // Put the active view's points on the map once both map and data are ready.
  useEffect(() => {
    if (!map || viewState.status !== 'ready') return
    setViewOnMap(map, viewState.data.manifest, viewState.data.entries)
    const cleanup = wireViewInteractions(map, { onSelect: setSelectedId })
    return () => {
      cleanup()
      try {
        removeViewFromMap(map)
      } catch {
        // map may already be destroyed on unmount
      }
    }
  }, [map, viewState])

  const entries = viewState.status === 'ready' ? viewState.data.entries : []
  const selected = entries.find((entry) => entry.id === selectedId) ?? null

  // Fly toward a newly selected entry.
  useEffect(() => {
    if (!map || !selected) return
    map.flyTo({
      center: [selected.lng, selected.lat],
      zoom: Math.max(map.getZoom(), 6),
      duration: 1400,
    })
  }, [map, selected])

  return (
    <div className="app">
      <MapView onMap={setMap} />
      {viewState.status === 'error' && <div className="error-banner">Failed to load view: {viewState.message}</div>}
      {selected && viewState.status === 'ready' && (
        <InfoCard entry={selected} accentColor={viewState.data.manifest.color} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
