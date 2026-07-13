import { entryYear } from '../data/geojson'
import type { TourStop } from '../tour/roster'
import { formatYear } from './TimelineBar'
import styles from './TourCard.module.css'

function lifespan(entryBirthYear: number | null, deathDate: string | undefined): string {
  const born = entryBirthYear !== null ? formatYear(entryBirthYear) : '?'
  const deathMatch = deathDate?.match(/^(-?\d+)/)
  const died = deathMatch ? formatYear(Number(deathMatch[1])) : ''
  return died ? `${born} – ${died}` : `b. ${born}`
}

/** Face card(s) for the tour's current stop, accented with the stop's journey color. */
export function TourCard({ stop }: { stop: TourStop }) {
  return (
    <div className={styles.stack} key={stop.index} aria-live="polite">
      {stop.entries.map((entry) => (
        <div key={entry.id} className={styles.card} style={{ '--accent': stop.color } as React.CSSProperties}>
          {entry.card.image && (
            <img className={styles.face} src={entry.card.image.thumbUrl} alt={entry.name} loading="eager" />
          )}
          <div className={styles.text}>
            <h3 className={styles.name}>{entry.name}</h3>
            <p className={styles.years}>{lifespan(entryYear(entry), entry.card.death?.date)}</p>
            {entry.card.birth?.place && <p className={styles.place}>{entry.card.birth.place}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
