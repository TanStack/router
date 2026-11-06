import { useHydrated } from '@tanstack/react-router'
import styles from '../styles/lazy-ssr-panel.module.css'

export default function LazySsrPanel() {
  const hydrated = useHydrated()
  return (
    <div
      className={styles.panel}
      data-testid="lazy-ssr-panel"
      data-hydrated={String(hydrated)}
    >
      This lazy component is rendered during SSR.
    </div>
  )
}
