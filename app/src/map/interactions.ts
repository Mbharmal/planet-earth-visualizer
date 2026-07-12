import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl'
import { CLUSTER_MAX_ZOOM, LAYER_CLUSTERS, LAYER_POINTS, VIEW_SOURCE } from './viewLayers'

export interface ClusterSelection {
  /** Screen position of the clicked cluster, for anchoring the popover. */
  screen: { x: number; y: number }
  entryIds: string[]
}

export interface ViewInteractionHandlers {
  onSelect: (entryId: string) => void
  /** Fired when a cluster can't be expanded by zooming (coincident coordinates). */
  onClusterLeaves: (selection: ClusterSelection) => void
}

/** Wire hover + click handling for the active view's layers. Returns a cleanup function. */
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

  const onPointMove = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature) return
    map.getCanvas().style.cursor = 'pointer'
    setHover(String(feature.properties.id))
  }

  const onPointLeave = () => {
    map.getCanvas().style.cursor = ''
    setHover(null)
  }

  const onPointClick = (e: MapLayerMouseEvent) => {
    const features = e.features ?? []
    // Past clusterMaxZoom, entries with identical coordinates render as stacked
    // individual dots — a click hits all of them, so offer the list again.
    const ids = [...new Set(features.map((f) => String(f.properties.id)))]
    if (ids.length > 1) {
      handlers.onClusterLeaves({ screen: { x: e.point.x, y: e.point.y }, entryIds: ids })
    } else if (ids[0]) {
      handlers.onSelect(ids[0])
    }
  }

  const onClusterEnter = () => {
    map.getCanvas().style.cursor = 'pointer'
  }

  const onClusterLeave = () => {
    map.getCanvas().style.cursor = ''
  }

  const onClusterClick = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0]
    if (!feature || feature.geometry.type !== 'Point') return
    const clusterId = feature.properties.cluster_id as number
    const [lng, lat] = feature.geometry.coordinates as [number, number]
    const source = map.getSource<GeoJSONSource>(VIEW_SOURCE)
    if (!source) return

    source
      .getClusterExpansionZoom(clusterId)
      .then(async (expansionZoom) => {
        if (expansionZoom <= CLUSTER_MAX_ZOOM) {
          map.easeTo({ center: [lng, lat], zoom: expansionZoom + 0.5, duration: 900 })
          return
        }
        // Irreducible cluster: entries share (nearly) identical coordinates —
        // zooming can never separate them, so hand the list to the UI instead.
        const leaves = await source.getClusterLeaves(clusterId, 100, 0)
        const point = map.project([lng, lat])
        handlers.onClusterLeaves({
          screen: { x: point.x, y: point.y },
          entryIds: leaves.map((leaf) => String(leaf.properties?.id)),
        })
      })
      .catch(() => {
        // cluster may have dissolved mid-flight (source data swapped); ignore
      })
  }

  map.on('mousemove', LAYER_POINTS, onPointMove)
  map.on('mouseleave', LAYER_POINTS, onPointLeave)
  map.on('click', LAYER_POINTS, onPointClick)
  map.on('mouseenter', LAYER_CLUSTERS, onClusterEnter)
  map.on('mouseleave', LAYER_CLUSTERS, onClusterLeave)
  map.on('click', LAYER_CLUSTERS, onClusterClick)

  return () => {
    map.off('mousemove', LAYER_POINTS, onPointMove)
    map.off('mouseleave', LAYER_POINTS, onPointLeave)
    map.off('click', LAYER_POINTS, onPointClick)
    map.off('mouseenter', LAYER_CLUSTERS, onClusterEnter)
    map.off('mouseleave', LAYER_CLUSTERS, onClusterLeave)
    map.off('click', LAYER_CLUSTERS, onClusterClick)
    map.getCanvas().style.cursor = ''
  }
}
