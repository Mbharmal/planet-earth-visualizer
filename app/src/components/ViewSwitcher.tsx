import type { ViewSummary } from '@pev/shared'
import styles from './ViewSwitcher.module.css'

interface ViewSwitcherProps {
  views: ViewSummary[]
  activeViewId: string | null
  loading: boolean
  hasJourneys: boolean
  journeysActive: boolean
  onSelect: (viewId: string) => void
  onJourneys: () => void
}

export function ViewSwitcher({
  views,
  activeViewId,
  loading,
  hasJourneys,
  journeysActive,
  onSelect,
  onJourneys,
}: ViewSwitcherProps) {
  if (views.length === 0 && !hasJourneys) return null

  return (
    <nav className={styles.bar} aria-label="Views">
      {views.map((view) => {
        const active = view.id === activeViewId && !journeysActive
        return (
          <button
            key={view.id}
            className={`${styles.chip} ${active ? styles.active : ''}`}
            style={active ? { background: view.color, borderColor: view.color } : undefined}
            onClick={() => onSelect(view.id)}
            aria-pressed={active}
          >
            <span aria-hidden>{view.emoji}</span> {view.title}
            {active && loading && <span className={styles.spinner} aria-label="loading" />}
          </button>
        )
      })}
      {hasJourneys && (
        <button
          className={`${styles.chip} ${journeysActive ? styles.active : ''}`}
          style={journeysActive ? { background: '#4a3aa7', borderColor: '#4a3aa7' } : undefined}
          onClick={onJourneys}
          aria-pressed={journeysActive}
        >
          <span aria-hidden>🧭</span> Journeys
        </button>
      )}
    </nav>
  )
}
