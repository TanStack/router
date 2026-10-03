# Reproducing the handler-elision comparison

The selected revision has no handler elision. This comparison measures removal
against the otherwise identical previous with-elision composition, **not** the
original router baseline. The user prioritizes intent preload; no-elision intent
timing is unresolved, while disabled remount is measurably slower than the
with-elision control. No new optimization is proposed here.

Use Node 24.8.0 and pnpm 11.21.0. Follow the root and benchmark guides, including
one Nx command at a time and each checkout's own built workspace packages.
The committed production source is the no-elision arm. Create two isolated
checkouts at this revision and install each at its root with:

```sh
CI=1 pnpm install --frozen-lockfile
```

In only the with-elision checkout, verify the no-elision Link hash below, then apply this exact-source zero-context patch:

```sh
git apply --unidiff-zero benchmarks/client-nav/link-presentation-browser/fixtures/with-elision-control.patch
```

The patch restores only Link event assembly; it changes no source/channel,
destination, control, cache, hook/effect or other runtime state.

Expected Link source SHA-256 after formatting:

| Arm          | SHA-256                                                          |
| ------------ | ---------------------------------------------------------------- |
| no-elision   | 101c96a15f3f1cc42be33c6f0a1ef5e78da2a38f35196bcc47280f3c261459e3 |
| with-elision | 3f4e75e0c2ff36dfc7a6484506d0b90720cb54b827ad5ae554afa5d97442ec82 |

Build each production app through Nx, serially:

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/react-link-presentation-browser:build --outputStyle=stream --skipRemoteCache
```

Copy each app's `dist/` into a static serving root at
`<arm>/browser/`; in the copied HTML files replace `/assets/` with
`/<arm>/browser/assets/`. Keep original build outputs intact. Serve that root
at `http://127.0.0.1:4180`. The runner expects these directories:

```text
with-elision/browser/index.html
no-elision/browser/index.html
```

With a task-owned Playwright CLI browser, run:

```sh
playwright-cli -s=elision-comparison --raw run-code --filename=benchmarks/client-nav/link-presentation-browser/paired-elision-comparison.js > /tmp/elision-paired.json
```

The runner performs all-row output/identity preflights before timing, rotates
disabled/intent/mixed modes and alternates arm order across six fixed blocks.
Each arm/mode/block uses 12 warmup, 48 untraced and 32 traced navigations.
There are 144 untraced and 96 traced samples per departure/remount direction
for each arm/mode. No tests or builds should overlap timing. No extension or
repeat was used in the saved result.

The preserved result table in RESULT-optimization-match-sources.md uses paired
log ratios of block means and Student-t 95% intervals (df 5, critical 2.57058).
Render is untraced click→onRendered; task is the click mark→enclosing Chromium
task end including microtasks. Timer opportunity is separately named; promises
are not treated as browser yields. Raw samples/maps/full validation logs remain
in ignored local artifacts; the tracked report, runner and exact control patch
provide small reproducible evidence for review.

To summarize the same raw result with explicit control labels:

```sh
python3 - <<'PY_SUMMARY'
import sys, json, importlib.util
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "stats", "benchmarks/client-nav/link-presentation-browser/summarize.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with open("/tmp/elision-paired.json") as source:
    data = json.load(source)
results = {}
for mode in ["disabled", "intent", "mixed"]:
    rows = [row for row in data["results"] if row["preloadLayout"] == mode]
    normalized = {**data, "results": [
        {**row, "arm": "baseline" if row["arm"] == "with-elision" else row["arm"]}
        for row in rows
    ]}
    stats = module.summarize(normalized)
    for arms in stats.values():
        arms["with-elision"] = arms.pop("baseline")
    results[mode] = stats
print(json.dumps({"control": "previous with-elision", "modes": results}, indent=2))
PY_SUMMARY
```

The temporary internal alias is required by the existing strict summarizer;
printed summaries and tracked evidence retain the actual with-elision control
name. This does not compare to the original baseline.
