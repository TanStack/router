import styles from './altComponent.module.css'
import { formatTimestamp } from './formatTimestamp'

export function AltCssContent({ data }: { data: { heading?: string } }) {
  const serverTimestamp = Date.now()

  const items = [
    { id: 1, text: 'Different color scheme (amber)' },
    { id: 2, text: 'Separate CSS module file' },
    { id: 3, text: 'Verifies CSS splitting behavior' },
  ]

  return (
    <div className={styles.wrapper} data-testid="rsc-css-alt-content">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span className={styles.tagline} data-testid="rsc-css-alt-badge">
          SERVER RENDERED
        </span>
        <span
          style={{
            fontSize: '11px',
            color: '#64748b',
            fontFamily: 'monospace',
          }}
          data-testid="rsc-css-alt-timestamp"
        >
          Fetched: {formatTimestamp(serverTimestamp)}
        </span>
      </div>

      <h2 className={styles.heading} data-testid="rsc-css-alt-heading">
        {data.heading || 'Alternate CSS Module'}
      </h2>

      <ul data-testid="rsc-css-alt-items">
        {items.map((item) => (
          <li
            key={item.id}
            className={styles.card}
            data-testid={`rsc-css-alt-item-${item.id}`}
          >
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
