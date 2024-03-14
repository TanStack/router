import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

import * as styles from './style.css'
import { TEST_DATA } from './test.const'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3 className={styles.indexPageTitle}>{TEST_DATA.welcome}</h3>
    </div>
  )
}
