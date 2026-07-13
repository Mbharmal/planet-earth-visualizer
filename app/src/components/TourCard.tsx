import type { ViewEntry } from '@pev/shared'
import { useState } from 'react'
import { entryYear } from '../data/geojson'
import type { TourStop } from '../tour/roster'
import { formatYear } from './TimelineBar'
import styles from './TourCard.module.css'

interface TourCardProps {
  stop: TourStop
  /** Called when the user expands a card — the tour should pause. */
  onExpand: () => void
}

function lifespan(entryBirthYear: number | null, deathDate: string | undefined): string {
  const born = entryBirthYear !== null ? formatYear(entryBirthYear) : '?'
  const deathMatch = deathDate?.match(/^(-?\d+)/)
  const died = deathMatch ? formatYear(Number(deathMatch[1])) : ''
  return died ? `${born} – ${died}` : `b. ${born}`
}

function KnownFor({ entry, compact }: { entry: ViewEntry; compact: boolean }) {
  const knownFor = entry.card.knownFor
  if (!knownFor) return null
  return (
    <div className={compact ? styles.knownFor : styles.knownForExpanded}>
      {knownFor.image && (
        <img
          className={compact ? styles.workThumb : styles.workImage}
          src={knownFor.image.thumbUrl}
          alt={knownFor.title}
          loading="eager"
        />
      )}
      {!knownFor.image && knownFor.formula && (
        // MathML sanitized at dataset-generation time; browsers render it natively.
        <span className={styles.formula} dangerouslySetInnerHTML={{ __html: knownFor.formula }} />
      )}
      <span className={styles.workTitle}>{knownFor.title}</span>
    </div>
  )
}

/** Face card(s) for the tour's current stop. Click a card to pause and expand. */
export function TourCard({ stop, onExpand }: TourCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = (entry: ViewEntry) => {
    if (expandedId === entry.id) {
      setExpandedId(null)
    } else {
      setExpandedId(entry.id)
      onExpand()
    }
  }

  return (
    <div className={styles.stack} key={stop.index} aria-live="polite">
      {stop.entries.map((entry) => {
        const expanded = expandedId === entry.id
        return (
          <div
            key={entry.id}
            className={`${styles.card} ${expanded ? styles.expanded : ''}`}
            style={{ '--accent': stop.color } as React.CSSProperties}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={() => toggle(entry)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle(entry)
              }
            }}
          >
            <div className={styles.header}>
              {entry.card.image && (
                <img className={styles.face} src={entry.card.image.thumbUrl} alt={entry.name} loading="eager" />
              )}
              <div className={styles.text}>
                <h3 className={styles.name}>{entry.name}</h3>
                <p className={styles.years}>{lifespan(entryYear(entry), entry.card.death?.date)}</p>
                {entry.card.birth?.place && <p className={styles.place}>{entry.card.birth.place}</p>}
              </div>
            </div>
            <KnownFor entry={entry} compact={!expanded} />
            {expanded && (
              <div className={styles.detail} onClick={(e) => e.stopPropagation()}>
                {entry.card.summary && <p className={styles.summary}>{entry.card.summary}</p>}
                {entry.card.facts.length > 0 && (
                  <ul className={styles.facts}>
                    {entry.card.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                )}
                <p className={styles.links}>
                  {entry.card.links.wikipedia && (
                    <a href={entry.card.links.wikipedia} target="_blank" rel="noreferrer">
                      Wikipedia
                    </a>
                  )}
                  {entry.card.links.wikidata && (
                    <a href={entry.card.links.wikidata} target="_blank" rel="noreferrer">
                      Wikidata
                    </a>
                  )}
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
