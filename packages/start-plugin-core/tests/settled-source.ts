/**
 * Page code: `settled(quiet)`, in a script that has `root` (the element the
 * page renders in). A page that hydrates the markup it already shows looks
 * finished, so `settled` waits for what the page has yet to do rather than
 * for a stretch of nothing changing. Each round lets a frame's intersection
 * observers run (a visible gate opens there, and this round's observer hears
 * in the same step, however late the frame), then every task queued after them
 * (React renders what the gate let through, which requests its code), and only
 * then asks what is in flight: the answer of a question asked earlier cannot
 * know of a request started since. Two rounds alike: nothing is left to happen.
 */
export const settledSource = `const settleRound = () => new Promise((resolve) => {
  const observer = new IntersectionObserver(() => {
    observer.disconnect()
    requestIdleCallback(resolve)
  })
  observer.observe(root)
})
const settled = async (quiet = 30, timeout = 10000) => {
  const start = performance.now()
  let last = ''
  let since = performance.now()
  while (performance.now() - start < timeout) {
    await Promise.race([
      settleRound(),
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ])
    // A module request still in flight (the page's own count, from the
    // browser's network events) keeps the page busy.
    const inFlight = window.__harnessInFlight ? await window.__harnessInFlight() : 0
    const state = performance.getEntriesByType('resource').length + ':' + inFlight + ':' + root.innerHTML
    if (state !== last || inFlight > 0) {
      last = state
      since = performance.now()
    } else if (performance.now() - since >= quiet) {
      return
    }
  }
  throw new Error('the page did not settle: ' + root.innerHTML)
}`
