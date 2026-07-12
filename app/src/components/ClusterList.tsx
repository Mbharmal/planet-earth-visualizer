import type { ViewEntry } from '@pev/shared'
import styles from './ClusterList.module.css'

interface ClusterListProps {
  entries: ViewEntry[]
  screen: { x: number; y: number }
  onSelect: (entryId: string) => void
  onClose: () => void
}

/** Popover for irreducible clusters: several entries at the same coordinates. */
export function ClusterList({ entries, screen, onSelect, onClose }: ClusterListProps) {
  const place = entries[0]?.card.birth?.place
  return (
    <div
      className={styles.popover}
      style={{
        left: Math.min(Math.max(screen.x, 130), window.innerWidth - 130),
        top: Math.min(Math.max(screen.y, 60), window.innerHeight - 60),
      }}
      role="dialog"
      aria-label="People at this location"
    >
      <div className={styles.header}>
        <span>
          {entries.length} {entries.length === 1 ? 'person' : 'people'}
          {place ? ` · ${place}` : ''}
        </span>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <ul className={styles.list}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button className={styles.item} onClick={() => onSelect(entry.id)}>
              <span className={styles.itemName}>{entry.name}</span>
              {entry.card.birth?.date && <span className={styles.itemDate}>{entry.card.birth.date.slice(0, 4)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
