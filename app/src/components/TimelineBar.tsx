import type { TourSpeed, TourStatus } from '../tour/tourEngine'
import styles from './TimelineBar.module.css'

export interface TimelineTourState {
  status: TourStatus
  speed: TourSpeed
  progress: { index: number; total: number } | null
}

interface TimelineBarProps {
  minYear: number
  maxYear: number
  /** Active era window, or null when unfiltered (full range shown). */
  range: [number, number] | null
  tour: TimelineTourState
  onRangeChange: (range: [number, number] | null) => void
  /** Start when idle; pause/resume when touring. */
  onTourToggle: () => void
  onTourStop: () => void
  onSpeedCycle: () => void
}

export function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : String(year)
}

/** Era filter + cinematic tour controls. */
export function TimelineBar({
  minYear,
  maxYear,
  range,
  tour,
  onRangeChange,
  onTourToggle,
  onTourStop,
  onSpeedCycle,
}: TimelineBarProps) {
  const [from, to] = range ?? [minYear, maxYear]
  const span = maxYear - minYear || 1
  const pct = (year: number) => (Math.min(Math.max(year, minYear), maxYear) - minYear) / span * 100
  const touring = tour.status !== 'idle'

  const emit = (nextFrom: number, nextTo: number) => {
    if (nextFrom <= minYear && nextTo >= maxYear) onRangeChange(null)
    else onRangeChange([nextFrom, nextTo])
  }

  return (
    <div className={styles.bar} aria-label="Era filter">
      <button
        className={styles.play}
        onClick={onTourToggle}
        aria-label={tour.status === 'playing' ? 'Pause tour' : tour.status === 'paused' ? 'Resume tour' : 'Play tour'}
      >
        {tour.status === 'playing' ? '❚❚' : '▶'}
      </button>
      {touring && (
        <>
          <button className={styles.pill} onClick={onSpeedCycle} aria-label="Tour speed">
            ×{tour.speed}
          </button>
          <button className={styles.pill} onClick={onTourStop} aria-label="Stop tour">
            ■
          </button>
          {tour.progress && (
            <span className={styles.progress}>
              {tour.progress.index}/{tour.progress.total}
            </span>
          )}
        </>
      )}
      <span className={styles.year}>{formatYear(from)}</span>
      <div className={styles.sliders}>
        <div className={styles.track} />
        <div className={styles.trackFill} style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={from}
          disabled={touring}
          aria-label="Era start"
          onChange={(e) => emit(Math.min(Number(e.target.value), to), to)}
        />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={Math.min(to, maxYear)}
          disabled={touring}
          aria-label="Era end"
          onChange={(e) => emit(from, Math.max(Number(e.target.value), from))}
        />
      </div>
      <span className={styles.year}>{formatYear(to)}</span>
      {range && !touring && (
        <button className={styles.reset} onClick={() => onRangeChange(null)} aria-label="Reset era filter">
          ✕
        </button>
      )}
    </div>
  )
}
