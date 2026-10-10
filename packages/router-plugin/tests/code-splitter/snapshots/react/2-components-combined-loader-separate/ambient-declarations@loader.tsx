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
const SplitLoader = () => {
  gtag('load')
  Analytics.track(buildId)
  Tracker.send('load')
  return Flags.On
}
export { SplitLoader as loader }
