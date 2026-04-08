import styles from './serverComponent.module.css'
import { formatTimestamp } from './formatTimestamp'
import { NestedAccentContent } from './NestedAccentContent'

export function CssModulesContent({ data }: { data: { title?: string } }) {
  const serverTimestamp = Date.UTC(2025, 0, 1, 0, 0, 0)

  const features = [
    { id: 1, text: 'Scoped class names prevent conflicts' },
    { id: 2, text: 'Works seamlessly in server components' },
    { id: 3, text: 'CSS is extracted and optimized' },
  ]

  return (
    <div className={styles.container} data-testid="rsc-css-modules-content">
      <div className={styles.header}>
        <span className={styles.badge} data-testid="rsc-css-modules-badge">
          SERVER RENDERED
        </span>
        <span
          className={styles.timestamp}
          data-testid="rsc-css-modules-timestamp"
        >
          Fetched: {formatTimestamp(serverTimestamp)}
        </span>
      </div>

      <h2 className={styles.title} data-testid="rsc-css-modules-title">
        {data.title || 'CSS Modules in RSC'}
      </h2>

      <ul data-testid="rsc-css-modules-features">
        {features.map((feature) => (
          <li
            key={feature.id}
            className={styles.featureItem}
            data-testid={`rsc-css-modules-feature-${feature.id}`}
          >
            {feature.text}
          </li>
        ))}
      </ul>

      <NestedAccentContent />
    </div>
  )
}
