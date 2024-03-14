import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

import * as styles from './style.css'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className={styles.indexPageStyle}>
      <h3>Welcome Home!</h3>
    </div>
  )
}
