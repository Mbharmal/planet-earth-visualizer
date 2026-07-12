import styles from './LoadingOverlay.module.css'

export function LoadingOverlay() {
  return (
    <div className={styles.overlay} aria-live="polite">
      <div className={styles.spinner} />
      <p>Loading the globe…</p>
    </div>
  )
}
