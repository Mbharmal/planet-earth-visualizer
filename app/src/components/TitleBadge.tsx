import styles from './TitleBadge.module.css'

export function TitleBadge({ subtitle }: { subtitle?: string }) {
  return (
    <header className={styles.badge}>
      <h1 className={styles.title}>🌍 Planet Earth Visualizer</h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  )
}
