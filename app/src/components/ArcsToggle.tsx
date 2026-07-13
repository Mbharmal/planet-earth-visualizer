import styles from './ArcsToggle.module.css'

interface ArcsToggleProps {
  active: boolean
  accentColor: string
  onToggle: () => void
}

/** Toggles the birth→death migration-arc layer for the active view. */
export function ArcsToggle({ active, accentColor, onToggle }: ArcsToggleProps) {
  return (
    <button
      className={`${styles.toggle} ${active ? styles.active : ''}`}
      style={active ? { background: accentColor, borderColor: accentColor } : undefined}
      onClick={onToggle}
      aria-pressed={active}
      title="Show where each person's life ended — arcs from birthplace to place of death"
    >
      ⤳ Life arcs
    </button>
  )
}
