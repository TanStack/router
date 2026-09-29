# Vue Link callback reactivity

This opt-in production benchmark measures eight shared-ref updates per batch
without navigation, Link prop changes, or parent-grid rerenders. One case has
200 mounted Links whose stable search callbacks read the ref; the mixed case
has 100 reactive callbacks and 100 static callbacks. Each update awaits Vue's
`nextTick`, including destination derivation and DOM publication.

Untimed setup checks every href in both update directions. Teardown checks
hrefs again, all 200 original anchor identities, the unchanged location/history,
and the grid's single render, then unmounts and destroys history. This separates
native callback-dependency scheduling from the navigation and mount workloads.

The alternate config filename prevents discovery by aggregate scenario globs;
no regular benchmark project depends on this optional project.

```sh
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-reactivity-vue:test:perf --outputStyle=stream --skipRemoteCache -- --run
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/client-nav-link-reactivity-vue:test:types:client --outputStyle=stream --skipRemoteCache
```

Compare identical fixture sources and production build settings on both refs.
Report per-case means, margins of error and sample counts; rerun noisy cases
separately before drawing conclusions.
