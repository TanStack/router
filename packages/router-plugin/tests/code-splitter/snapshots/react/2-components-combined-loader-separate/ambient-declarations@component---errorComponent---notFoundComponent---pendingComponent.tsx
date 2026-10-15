declare function gtag(event: string): void
declare enum Flags {
  On = 1,
}
declare namespace Analytics {
  function track(event: string): void
}
declare const buildId: string
declare class Tracker {
  static send(event: string): void
}
const SplitComponent = () => (
  <button
    onClick={() => {
      gtag('click')
      Analytics.track(buildId)
      Tracker.send('click')
    }}
  >
    {Flags.On}
  </button>
)
export { SplitComponent as component }
