import type { JourneySummary } from '@pev/shared'
import styles from './JourneyPicker.module.css'

interface JourneyPickerProps {
  journeys: JourneySummary[]
  onSelect: (journeyId: string) => void
  onClose: () => void
}

/** Overlay listing available journeys — pick one to start the player. */
export function JourneyPicker({ journeys, onSelect, onClose }: JourneyPickerProps) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} role="dialog" aria-label="Choose a story" onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🧭 Stories</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className={styles.tagline}>Follow a life — or a moment in history — across the globe, chapter by chapter.</p>
        <ul className={styles.list}>
          {journeys.map((journey) => (
            <li key={journey.id}>
              <button className={styles.item} onClick={() => onSelect(journey.id)}>
                <span className={styles.swatch} style={{ background: journey.color }} />
                <span className={styles.itemText}>
                  <span className={styles.person}>{journey.subject}</span>
                  <span className={styles.title}>{journey.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
