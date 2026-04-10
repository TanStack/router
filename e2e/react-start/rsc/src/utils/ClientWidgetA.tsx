'use client'

import * as React from 'react'
import styles from './ClientWidgetA.module.css'

/**
 * Client widget A - rendered DIRECTLY inside server component.
 * Uses CSS module A with purple theme.
 */
export function ClientWidgetA({ title }: { title: string }) {
  const [count, setCount] = React.useState(0)

  return (
    <div className={styles.widget} data-testid="client-widget-a">
      <div className={styles.header}>
        <span className={styles.badge} data-testid="client-widget-a-badge">
          CLIENT A (Direct)
        </span>
      </div>
      <h3 className={styles.title} data-testid="client-widget-a-title">
        {title}
      </h3>
      <p className={styles.content}>
        Rendered directly inside createCompositeComponent.
      </p>
      <div className={styles.counter}>
        <button
          className={styles.button}
          onClick={() => setCount((c) => c - 1)}
          data-testid="client-widget-a-decrement"
        >
          -
        </button>
        <span className={styles.count} data-testid="client-widget-a-count">
          {count}
        </span>
        <button
          className={styles.button}
          onClick={() => setCount((c) => c + 1)}
          data-testid="client-widget-a-increment"
        >
          +
        </button>
      </div>
    </div>
  )
}
