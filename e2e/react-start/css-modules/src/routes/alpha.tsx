import { createFileRoute } from '@tanstack/react-router'
import { Header } from '../components/Header'
import styles from '../styles/alpha.module.css'

export const Route = createFileRoute('/alpha')({ component: Alpha })

function Alpha() {
  return (
    <div className={styles.page} data-testid="route-page">
      <Header title="Alpha" />
    </div>
  )
}
