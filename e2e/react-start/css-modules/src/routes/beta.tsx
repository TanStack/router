import { createFileRoute } from '@tanstack/react-router'
import { Header } from '../components/Header'
import styles from '../styles/beta.module.css'

export const Route = createFileRoute('/beta')({ component: Beta })

function Beta() {
  return (
    <div className={styles.page} data-testid="route-page">
      <Header title="Beta" />
    </div>
  )
}
