# DOM script micro-pass results

## Scope

Baseline: `697ebb6ddbd433d052b6b4707938a5c595865d58` (`main`)

Candidate production commits:

- `6e12093800` — share the private script-attribute copier in Solid and Vue
- `b16f2ebff1` — scan static `querySelectorAll` results directly instead of allocating arrays and callbacks
- `d674d4cecd` — use idempotent `HTMLScriptElement.remove()` in Solid cleanup

The changes are private to `Asset.tsx`. Public component props, exported types,
rendered attributes, script matching rules, and script lifecycle behavior are
unchanged. React already uses these three implementation shapes.

## Isolated attribution

All values are bytes relative to the exact-main control. Gzip is the primary
metric.

| Hunk                     | Scenario            | Raw | Initial gzip | Gzip | Brotli |
| ------------------------ | ------------------- | --: | -----------: | ---: | -----: |
| Shared attribute copier  | `solid-router.full` | -73 |          -22 |  -21 |    -39 |
| Shared attribute copier  | `vue-router.full`   | -73 |          -15 |  -14 |    +52 |
| Direct static-node scan  | `solid-router.full` | -20 |          -11 |   -9 |    -36 |
| Direct static-node scan  | `vue-router.full`   | -20 |           -6 |   -6 |    +30 |
| Copier + direct scan     | `solid-router.full` | -93 |          -34 |  -32 |    -19 |
| Copier + direct scan     | `vue-router.full`   | -93 |          -20 |  -21 |    -31 |
| Idempotent Solid cleanup | `solid-router.full` | -66 |          -10 |   -8 |    -42 |

Every independent production hunk improves gzip. The two shared Solid/Vue
hunks also compose better than either hunk's isolated Brotli result in Vue.

## Final 17-scenario matrix

Fresh control: `/tmp/dom-script-fresh-control-full.json`

Candidate: `/tmp/dom-script-final-rerun.json`

| Scenario                           |  Raw | Initial gzip | Gzip | Brotli |
| ---------------------------------- | ---: | -----------: | ---: | -----: |
| `react-router.minimal`             |    0 |            0 |    0 |      0 |
| `react-router.full`                |    0 |            0 |    0 |      0 |
| `solid-router.minimal`             |    0 |            0 |    0 |      0 |
| `solid-router.full`                | -159 |          -42 |  -40 |    -25 |
| `vue-router.minimal`               |    0 |            0 |    0 |      0 |
| `vue-router.full`                  |  -93 |          -20 |  -21 |    -31 |
| `react-start.minimal`              |    0 |            0 |    0 |      0 |
| `react-start.deferred-hydration`   |    0 |            0 |    0 |      0 |
| `react-start.full`                 |    0 |            0 |    0 |      0 |
| `react-start.rsbuild.minimal`      |    0 |            0 |    0 |      0 |
| `react-start.rsbuild.minimal-iife` |    0 |            0 |    0 |      0 |
| `react-start.rsbuild.full`         |    0 |            0 |    0 |      0 |
| `solid-start.minimal`              | -159 |          -30 |  -31 |    +56 |
| `solid-start.deferred-hydration`   | -159 |          -31 |  -27 |    +16 |
| `solid-start.full`                 | -159 |          -28 |  -31 |    -30 |
| `vue-start.minimal`                |  -93 |          -27 |  -27 |    +57 |
| `vue-start.full`                   |  -93 |          -10 |  -10 |    +43 |

Summary:

- Raw: `-159..0`; 7 improved, 10 neutral, 0 regressed
- Initial gzip: `-42..0`; 7 improved, 10 neutral, 0 regressed
- Gzip: `-40..0`; 7 improved, 10 neutral, 0 regressed
- Brotli: `-31..+57`; 3 improved, 10 neutral, 4 regressed

The unchanged minimal router bundles confirm that the new private helper does
not leak across tree-shaking boundaries.

## Runtime and semantics

- `querySelectorAll` returns a static `NodeList`, so direct iteration visits the
  same snapshot in the same order as `Array.from(...).find(...)` while removing
  the temporary array and callback.
- `Element.remove()` is idempotent. It has the same result as the previous
  guarded `parentNode.removeChild` sequence when the script is attached,
  detached, or moved.
- Attribute iteration still uses `Object.entries`, preserves iteration order,
  skips `undefined` and `false`, emits an empty attribute for `true`, and
  stringifies all other values.
- The direct scan removes an allocation and callback from each lookup; cleanup
  removes a branch and property read. The shared copier adds one call only on
  the rare DOM script-insertion path, which is dominated by DOM operations and
  is the same implementation already used by React Router.

## Tests

Focused client tests cover both attribute-copying call sites, both duplicate
scan branches, boolean attribute handling, and attached/detached Solid cleanup.

- Solid Router client: 55 files, 839 passed, 1 skipped, no type errors
- Solid Router server: 3 files, 3 passed, no type errors
- Vue Router: 54 files, 815 passed, 1 skipped, no type errors
- Solid Router types: TypeScript 5.6, 5.7, 5.8, 5.9, 6.0, and 7.0 passed
- Vue Router types: 17 files, 138 passed, no type errors
- Solid and Vue Router eslint: passed; Vue reported 79 pre-existing warnings
  and no errors

## Rejected nearby variants

- Sharing Vue preserved-head retention branches saved only 4 gzip bytes in
  `vue-router.full`, regressed Brotli by 18 bytes, and mixed update/unmount
  cleanup semantics; it was dropped.
- Reusing the default script-type literal across all frameworks regressed
  `react-router.full` gzip by 1 byte, so it was not included in this
  cross-framework group.
- Reusing a single Vue hydration state across `ScriptOnce`, `Scripts`, and
  `Html` saved 25 gzip bytes in `vue-router.full` but regressed Brotli by 31
  bytes and coupled three lifecycle boundaries; it was kept out of this small,
  local DOM pass.
