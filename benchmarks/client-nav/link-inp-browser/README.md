# Link INP in a real browser

Opt-in harness (`@benchmarks/link-inp-browser`, not part of any CodSpeed
aggregate) that measures what clicking a Link costs in headless Chromium,
comparing a baseline build of the router packages with the current checkout.
It complements the jsdom `lane-*` cases of `../link-performance` (React),
`../link-lanes-solid` (Solid) and `../link-lanes-vue` (Vue) with Event Timing
and frame timing.

## Workloads

`react/main.tsx`, `solid/main.tsx` and `vue/main.tsx` build the same app: a root with two
control Links (`/lane/a`, `/lane/b`), a staying `/lane` layout and two leaves.
`/lane/b` renders no Links. Cases (`shared/cases.ts`):

| Case                      | Layout Links | `/lane/a` leaf Links                   |
| ------------------------- | ------------ | -------------------------------------- |
| `lane-departing`          | 0            | 1,000 fixed                            |
| `lane-departing-updaters` | 0            | 1,000 search updaters (`to="."` / odd) |
| `lane-retained`           | 1,000 fixed  | 0                                      |
| `lane-mixed`              | 500 fixed    | 500 fixed                              |

Fixed Links match the jsdom suites: 40 per 1,000 flip active state per
navigation. Each case runs without loaders and with 50 ms loaders on both
leaves (`defaultStaleReloadMode: 'blocking'`, so every navigation waits for
them). With loaders the click only starts the navigation; the destination
renders in a later task.

## Arms

- `build:candidate` builds this checkout's packages with Nx, then the three apps
  into `dist/candidate/<framework>`.
- `build:baseline` checks out `git merge-base HEAD origin/main` (override with
  `LINK_INP_BASELINE_REF`) in a detached worktree at
  `$LINK_INP_BASELINE_DIR` (default `<tmpdir>/tanstack-router-link-inp-baseline`),
  installs and builds its packages there, then builds the same app sources
  into `dist/baseline/<framework>`.

`vite.config.ts` resolves the apps' bare imports from the chosen checkout's
`benchmarks/client-nav` package, so both arms bundle identical app code with
their own production `dist` packages. `dist/<arm>/manifest.json` records the
commit, uncommitted router sources and bundle hashes; the runner refuses arms
with identical bundles.

## Measurement

`run.ts` serves each arm and framework on its own origin and drives Chromium
with Playwright. Every round loads each configuration once per arm, in fresh
browser contexts, alternating which arm goes first. A page warms up with 10
round trips, then records 40 navigations (20 per direction). Each navigation
starts settled (idle callback, frame and task) and is a real
`page.mouse.click` on a control Link, so Chromium produces Event Timing
entries. `shared/probe.ts` records, from a capturing `click` listener on
`window`:

| Metric               | Meaning                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click task           | Up to the window's bubble `click` listener. Trusted events drain microtasks after each listener, so this includes the frameworks' listeners and every microtask they queue: the click's first yield. Matches Event Timing click processing. |
| Interaction duration | Largest Event Timing `duration` sharing the click's `interactionId` (what INP reports; 8 ms granularity; under 16 ms is not reported and counts as 8 ms).                                                                                   |
| Click processing     | Event Timing `processingEnd - processingStart` of the click.                                                                                                                                                                                |
| Next frame           | A task queued from the first `requestAnimationFrame` after the click: the frame that presents the click.                                                                                                                                    |
| Destination in DOM   | A `MutationObserver` sees the destination leaf replace the source leaf.                                                                                                                                                                     |
| First task           | A MessageChannel task posted at the click. Chromium prioritizes rendering after discrete input, so this runs after the next frame and tracks it.                                                                                            |

Headless Chromium schedules the frame after an input about 15 ms later, so
next-frame times and Event Timing durations have a floor near 16 ms; the click
task is the precise, unquantized measure. `--throttle 4` applies
`Emulation.setCPUThrottlingRate` to emulate a mid-range device.

Statistics pair the two arms' pages of each round: Δ is the mean of per-page
median differences (ms) and the geometric mean of per-page median ratios
(%), with 95% Student t intervals over rounds. Event Timing durations come in
8 ms buckets, so they use per-page and pooled means instead of medians. The report also gives each
arm's pooled medians, the baseline's between-page coefficient of variation and
the 1-minute load average while measuring. `--aa` serves the baseline to both
arms to calibrate noise.

## Running

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/link-inp-browser:test:perf --outputStyle=stream --skipRemoteCache --args="--throttle=1+4 --rounds=10 --out=results/inp"
```

`test:perf` builds both arms first. Options (defaults): `--frameworks
react+solid+vue`, `--cases` (all), `--loaders 0+50`, `--throttle 1+4`, `--rounds
6`, `--warmup 10` (round trips), `--navigations 40`, `--out
results/<timestamp>`, `--channel chromium` (full browser in new headless mode
instead of the headless shell), `--chrome-args a+b`, `--aa` and `--from
results/<name>.json` (re-render a saved run's report without measuring) and
`--resume results/<name>.json` (continue an interrupted run with the same
options and builds; the partial round is discarded). Lists take `+`
or `,`, but Nx splits `--args` on commas, so use `+` there. Results go to
`results/<name>.json` (comparisons and raw samples) and `results/<name>.md`,
rewritten after every round. Install the browser with
`pnpm exec playwright install chromium` if Playwright cannot find it.

Remove the baseline worktree with
`git worktree remove --force <tmpdir>/tanstack-router-link-inp-baseline`.
