import type { ViewEntry } from '@pev/shared'
import styles from './InfoCard.module.css'

interface InfoCardProps {
  entry: ViewEntry
  accentColor: string
  /** 'events' renders start/end dates instead of birth/death. */
  kind?: 'people' | 'events'
  onClose: () => void
}

function formatLifeline(entry: ViewEntry, kind: 'people' | 'events'): string | null {
  const { birth, death } = entry.card
  if (kind === 'events') {
    if (!birth?.date) return null
    return death?.date && death.date !== birth.date ? `${birth.date} – ${death.date}` : birth.date
  }
  const born = birth?.date ? `${birth.date}${birth.place ? `, ${birth.place}` : ''}` : null
  const died = death?.date ? `${death.date}${death.place ? `, ${death.place}` : ''}` : null
  if (!born && !died) return null
  return [born && `Born ${born}`, died && `Died ${died}`].filter(Boolean).join(' · ')
}

export function InfoCard({ entry, accentColor, kind = 'people', onClose }: InfoCardProps) {
  const lifeline = formatLifeline(entry, kind)
  const { card } = entry

  return (
    <aside className={styles.card} aria-label={entry.name}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        ×
      </button>
      {card.image && (
        <div className={styles.imageWrap}>
          <img src={card.image.thumbUrl} alt={entry.name} loading="lazy" />
        </div>
      )}
      <div className={styles.body}>
        <h2 className={styles.name} style={{ borderColor: accentColor }}>
          {entry.name}
        </h2>
        <p className={styles.summary}>{card.summary}</p>
        {lifeline && <p className={styles.lifeline}>{lifeline}</p>}
        {card.facts.length > 0 && (
          <ul className={styles.facts}>
            {card.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        )}
        <p className={styles.links}>
          {card.links.wikipedia && (
            <a href={card.links.wikipedia} target="_blank" rel="noreferrer">
              Wikipedia
            </a>
          )}
          {card.links.wikidata && (
            <a href={card.links.wikidata} target="_blank" rel="noreferrer">
              Wikidata
            </a>
          )}
        </p>
      </div>
    </aside>
  )
}
