/// <reference types="vite/client" />
import styles from './CssModulesCard.module.css'

export function CssModulesCard() {
  return (
    <div className={styles.card} data-testid="rsc-hmr-modules-card">
      <h2 className={styles.title} data-testid="rsc-hmr-modules-title">
        Server Rendered
      </h2>
    </div>
  )
}
