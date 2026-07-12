import type { ViewSummary } from '@pev/shared'
import styles from './ViewSwitcher.module.css'

interface ViewSwitcherProps {
  views: ViewSummary[]
  activeViewId: string | null
  loading: boolean
  onSelect: (viewId: string) => void
}

export function ViewSwitcher({ views, activeViewId, loading, onSelect }: ViewSwitcherProps) {
  if (views.length === 0) return null

  return (
    <nav className={styles.bar} aria-label="Views">
      {views.map((view) => {
        const active = view.id === activeViewId
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
    </nav>
  )
}
