import type { Journey } from '@pev/shared'
import styles from './JourneyPanel.module.css'

interface JourneyPanelProps {
  journey: Journey
  waypointIndex: number
  autoplay: boolean
  onNext: () => void
  onPrev: () => void
  onAutoplayToggle: () => void
  onOverview: () => void
  onExit: () => void
}

const ROLE_LABEL: Record<string, string> = {
  birth: 'Born here',
  education: 'Studied here',
  work: 'Worked here',
  residence: 'Lived here',
  voyage: 'Passed through',
  death: 'Died here',
}

/** The journey's reading panel: chapter narrative, media, works, resources, navigation. */
export function JourneyPanel({
  journey,
  waypointIndex,
  autoplay,
  onNext,
  onPrev,
  onAutoplayToggle,
  onOverview,
  onExit,
}: JourneyPanelProps) {
  const wp = journey.waypoints[waypointIndex]
  if (!wp) return null
  const last = waypointIndex === journey.waypoints.length - 1

  return (
    <aside className={styles.panel} style={{ '--accent': journey.color } as React.CSSProperties} aria-label={journey.title}>
      <div className={styles.header}>
        {journey.person.image && (
          <img className={styles.portrait} src={journey.person.image.thumbUrl} alt={journey.person.name} />
        )}
        <div className={styles.headerText}>
          <h2 className={styles.name}>{journey.person.name}</h2>
          <p className={styles.lifespan}>{journey.person.lifespan}</p>
        </div>
        <button className={styles.exit} onClick={onExit} aria-label="Exit journey">
          ×
        </button>
      </div>

      <div className={styles.chapter}>
        <p className={styles.chapterMeta}>
          Chapter {waypointIndex + 1} of {journey.waypoints.length} · {wp.from}
          {wp.to ? ` – ${wp.to}` : ''} · {ROLE_LABEL[wp.role] ?? wp.role}
        </p>
        <h3 className={styles.chapterTitle}>{wp.title}</h3>
        <p className={styles.place}>{wp.place}</p>
        <p className={styles.narrative}>{wp.narrative}</p>

        {wp.media?.image && (
          <figure className={styles.figure}>
            <img src={wp.media.image.thumbUrl} alt={wp.media.image.caption ?? wp.title} loading="lazy" />
            {wp.media.image.caption && <figcaption>{wp.media.image.caption}</figcaption>}
          </figure>
        )}
        {wp.media?.formula && (
          <figure className={styles.formulaBlock}>
            {/* MathML is repo-authored and schema-checked; browsers render it natively. */}
            <div className={styles.formula} dangerouslySetInnerHTML={{ __html: wp.media.formula }} />
            {wp.media.formulaCaption && <figcaption>{wp.media.formulaCaption}</figcaption>}
          </figure>
        )}

        {wp.works && wp.works.length > 0 && (
          <div className={styles.works}>
            {wp.works.map((work) => (
              <span key={work} className={styles.workChip}>
                {work}
              </span>
            ))}
          </div>
        )}

        {wp.resources && wp.resources.length > 0 && (
          <div className={styles.resources}>
            <h4>Go deeper</h4>
            {wp.resources.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
                {r.label} ↗
              </a>
            ))}
          </div>
        )}
      </div>

      {last && journey.resources && journey.resources.length > 0 && (
        <div className={styles.resources}>
          <h4>Further reading on {journey.person.name}</h4>
          {journey.resources.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
              {r.label} ↗
            </a>
          ))}
        </div>
      )}

      <div className={styles.controls}>
        <button onClick={onPrev} disabled={waypointIndex === 0} aria-label="Previous chapter">
          ◀
        </button>
        <button onClick={onAutoplayToggle} aria-label={autoplay ? 'Stop autoplay' : 'Start autoplay'} aria-pressed={autoplay}>
          {autoplay ? '❚❚ Auto' : '▶ Auto'}
        </button>
        <button onClick={onOverview} aria-label="Show whole journey">
          🌍
        </button>
        <button onClick={onNext} disabled={last} aria-label="Next chapter" className={styles.nextBtn}>
          Next ▶
        </button>
      </div>
      <p className={styles.attribution}>{journey.attribution}</p>
    </aside>
  )
}
