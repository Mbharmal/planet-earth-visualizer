import type { Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl'
import { LAYER_POINTS, VIEW_SOURCE } from './viewLayers'

export interface ViewInteractionHandlers {
  onSelect: (entryId: string) => void
}

/** Wire hover + click handling for the active view's point layer. Returns a cleanup function. */
export function wireViewInteractions(map: MapLibreMap, handlers: ViewInteractionHandlers) {
  let hoveredId: string | null = null

  const setHover = (id: string | null) => {
    if (hoveredId !== null) {
      map.setFeatureState({ source: VIEW_SOURCE, id: hoveredId }, { hover: false })
    }
    if (id !== null) {
      map.setFeatureState({ source: VIEW_SOURCE, id }, { hover: true })
    }
    hoveredId = id
  }

  const onMove = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature) return
    map.getCanvas().style.cursor = 'pointer'
    setHover(String(feature.properties.id))
  }

  const onLeave = () => {
    map.getCanvas().style.cursor = ''
    setHover(null)
  }

  const onClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0]
    if (feature) handlers.onSelect(String(feature.properties.id))
  }

  map.on('mousemove', LAYER_POINTS, onMove)
  map.on('mouseleave', LAYER_POINTS, onLeave)
  map.on('click', LAYER_POINTS, onClick)

  return () => {
    map.off('mousemove', LAYER_POINTS, onMove)
    map.off('mouseleave', LAYER_POINTS, onLeave)
    map.off('click', LAYER_POINTS, onClick)
    map.getCanvas().style.cursor = ''
  }
}
