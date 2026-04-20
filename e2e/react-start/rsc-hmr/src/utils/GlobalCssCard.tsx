import './GlobalCssCard.css'

export function GlobalCssCard() {
  return (
    <div
      className="rsc-hmr-global-card"
      data-testid="rsc-hmr-global-card"
    >
      <h2
        className="rsc-hmr-global-title"
        data-testid="rsc-hmr-global-title"
      >
        Server Rendered
      </h2>
    </div>
  )
}
