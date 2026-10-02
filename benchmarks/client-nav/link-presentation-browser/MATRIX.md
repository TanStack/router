# Reproducing the focused Link matrix

The source-controlled support contains fixtures and scripts, not generated bundles, raw traces, result JSON/CSV, or build logs. Keep evidence in an external directory. Use Node from `.nvmrc`, pnpm from root `package.json`, the root dependencies including `@playwright/test`, and Python 3.9 or newer. The portable analyzer reproduced all 96 metric rows, 768 paired comparisons, and 12 A/A calibration rows exactly; source-map and bundle parity passed for all eight arms, and all 136 production gates passed. Final package and bundle validation remain separate requirements.

The frozen arm order is `main`, `pr8587`, `pr8572`, `pr8582`, `H+E3+wrapper`, `J`, `K`, `main-repeat`. All eight take part in eight Williams rounds. `main-repeat` copies the exact main bundle bytes as a balanced A/A arm; there is no additional end-of-round sentinel. Five timed pages produce six outcomes: dense departure/remount, retained nonroot/deep updaters, and active-options/disabled-equivalent parent updates.

Each timed page/round gets 16 warmups, 24 untraced render samples, and 24 separately traced task samples. Departure/remount alternate, giving 96 samples per direction/metric across eight rounds; every other outcome has 192. Each round must contain exactly 40 records, giving 320 records, 96 metric rows, and 768 ordered paired comparisons. All 136 gates are required: 13 common cases, two untimed presentation diagnostics, and pending/cache gates for each arm. Timed presentation pages never enable counters or rewrites; diagnostic pages refuse sampling.

Navigation render time ends at public `onRendered`; parent-update render time ends at a parent layout-effect commit marker. Chromium task time ends at the task containing the click start mark. That is a click-to-first-yield proxy; it does not measure paint or INP. Traced and untraced values stay separate. Retained DOM correctness is checked before the pending click's task ends.

The analyzer preserves the experiment's calculations: medians of eight independent round means, 10,000 bootstrap draws with seed 20261002 for absolute intervals, and geometric means of paired ratios with nominal 95% Student-t intervals on log ratios (df 7). It does not pool within-round samples or change the retained percentile indices. Intervals crossing zero are unresolved, not equivalence; there is no multiple-comparison correction.

## Inputs and layout

`provenance.json` must list the complete ordered roster, exact head SHAs, component manifests, successful build status, fixture hashes, bundle hashes, runtime versions, and independently measured `minimalBundle` metrics. Retain exact candidate manifests/full sources and historical revisions outside the source tree. Historical prebuilt arms may be reused only after hash verification. Do not relabel bundles without preserving their source provenance.

`--bundle-root` has one directory per arm, containing:

```text
<arm>/browser/index.html
<arm>/browser/pending.html
<arm>/presentation-props/presentation-props.html
<arm>/no-links/no-links.html
<arm>/build-location/build-location.html
<arm>/cache-gate/cache-gate.html
```

Keep each group's `assets/` and source maps alongside its HTML. `--fixture-root` points to this tracked benchmark directory, whose `src/` files must equal source-map `sourcesContent` in every arm. The parity verifier checks actual bundle hashes and all fixture files, then writes a provenance copy and `fixture-parity.json` to its output root.

Build each arm in a clean, disposable, user-provided isolated checkout at its declared revision, with its retained candidate sources applied. Copy identical benchmark fixture sources into each checkout and use its required Node/pnpm versions. Install at that checkout's root with `CI=1 pnpm install --frozen-lockfile`, then run `pnpm format` before validation. From the checkout root, run one Nx command at a time:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build:presentation-props --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build:no-links --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build:build-location --outputStyle=stream --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build:cache-gate --outputStyle=stream --skipRemoteCache
```

Copy the complete emitted directories into the matching arm under `--bundle-root`: `dist/` to `browser/`, `dist-presentation-props/` to `presentation-props/`, `dist-no-links/` to `no-links/`, `dist-build-location/` to `build-location/`, and `dist-cache-gate/` to `cache-gate/`. Retain formatted source hashes, every bundle file's SHA-256, runtime versions, revision/component manifests, and successful build status in `provenance.json`. Seed `main-repeat` from main's exact bundle bytes and provenance. The verifier checks reused artifacts before measurement. The support scripts consume prepared artifacts; checkout management is manual. Minimal bundle measurements remain separate from fixture builds.

## Commands

From the repository root, set paths for your own evidence. These variable names are examples, not required directory names:

```sh
LINK_FIXTURE=benchmarks/client-nav/link-presentation-browser
LINK_ARTIFACT_ROOT=/path/to/link-matrix-evidence
LINK_BUNDLE_ROOT=/path/to/link-matrix-bundles
LINK_SIZE_ROOT=/path/to/retained-size-results

python3 "$LINK_FIXTURE/matrix-verify-fixtures.py" \
  --artifact-root "$LINK_ARTIFACT_ROOT" --bundle-root "$LINK_BUNDLE_ROOT" \
  --fixture-root "$LINK_FIXTURE"

node "$LINK_FIXTURE/matrix-runner.mjs" \
  --artifact-root "$LINK_ARTIFACT_ROOT" --bundle-root "$LINK_BUNDLE_ROOT"

python3 "$LINK_FIXTURE/matrix-analyze.py" \
  --artifact-root "$LINK_ARTIFACT_ROOT" --size-root "$LINK_SIZE_ROOT" \
  --size-manifest /path/to/size-manifest.json
```

The runner accepts `--browser-path` for an installed Chromium executable and `--port` (default 4188). Otherwise it uses Playwright's normal installed Chromium. `--playwright-module` accepts a package import specifier or module path when validating a standalone script outside the repository dependency tree; it never selects a browser version silently. Retain the exact browser version with raw records.

`--gates-only` runs the complete gates without timing. `--reuse-gates` requires gates whose provenance fingerprint matches the current input manifest; old evidence without that fingerprint cannot be reused silently. Timing refuses existing `raw/round-0.json`: use a fresh artifact root for a repetition. Stop builds and other CPU-heavy work during measurement.

The Python scripts accept `--provenance` and `--output-root` so existing evidence can be verified/analyzed into a separate validation directory. The analyzer requires a complete arm-to-size-file mapping. Choose a common evidence ancestor as the size root, or copy retained measurement files into one directory; paths in the mapping are relative to that root. `matrix-size-manifest.example.json` documents the schema. Each mapping value is either a relative filename or `{ "path": "relative/file.json", "sha256": "optional retained digest" }`. Every file must report a successful `react-router.minimal` measurement matching the arm's provenance metrics. Missing inputs, mismatched hashes, dropped gates, incomplete rounds, duplicate cases, altered order, and wrong sample counts fail visibly. Python optimization mode is rejected because assertions are required.

`matrix-design.json` preserves the final focused design. Broad navigation, zero-Link, and builder timings remain separately retained evidence; [BUILD-LOCATION.md](BUILD-LOCATION.md) gives their batch counts. The full [client navigation guide](../README.md), package/app correctness checks, and full bundle workflow are still required before accepting a runtime winner. No generated report or historical winner narrative is embedded in the scripts.
