import { renderServerComponent } from '@tanstack/react-start/rsc'
import styles from './helperCard.module.css'

// A server component that only this helper module renders: it is not
// exported, so nothing but the CSS injection of the render call can load its
// styles.
function HelperCard() {
  return (
    <section className={styles.card} data-testid="rsc-css-helper-card">
      <h2>Helper module card</h2>
      <p>
        Rendered by a helper module outside the server function file, with a CSS
        module of the helper module.
      </p>
    </section>
  )
}

export function renderHelperCard() {
  return renderServerComponent(<HelperCard />)
}
