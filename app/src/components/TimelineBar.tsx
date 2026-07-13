import styles from './TimelineBar.module.css'

interface TimelineBarProps {
  minYear: number
  maxYear: number
  /** Active era window, or null when unfiltered (full range shown). */
  range: [number, number] | null
  playing: boolean
  onRangeChange: (range: [number, number] | null) => void
  onPlayToggle: () => void
}

export function formatYear(year: number): string {
  return year < 0 ? `${-year} BCE` : String(year)
}

/** Era filter: dual-handle year slider + time-lapse play button. */
export function TimelineBar({ minYear, maxYear, range, playing, onRangeChange, onPlayToggle }: TimelineBarProps) {
  const [from, to] = range ?? [minYear, maxYear]
  const span = maxYear - minYear || 1
  const pct = (year: number) => ((year - minYear) / span) * 100

  const emit = (nextFrom: number, nextTo: number) => {
    if (nextFrom <= minYear && nextTo >= maxYear) onRangeChange(null)
    else onRangeChange([nextFrom, nextTo])
  }

  return (
    <div className={styles.bar} aria-label="Era filter">
      <button
        className={styles.play}
        onClick={onPlayToggle}
        aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <span className={styles.year}>{formatYear(from)}</span>
      <div className={styles.sliders}>
        <div className={styles.track} />
        <div className={styles.trackFill} style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={from}
          aria-label="Era start"
          onChange={(e) => emit(Math.min(Number(e.target.value), to), to)}
        />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={to}
          aria-label="Era end"
          onChange={(e) => emit(from, Math.max(Number(e.target.value), from))}
        />
      </div>
      <span className={styles.year}>{formatYear(to)}</span>
      {range && (
        <button className={styles.reset} onClick={() => onRangeChange(null)} aria-label="Reset era filter">
          ✕
        </button>
      )}
    </div>
  )
}
