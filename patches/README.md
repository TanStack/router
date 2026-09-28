# Local Store lifetime patch

`@tanstack__store@0.11.1.patch` is a temporary prerequisite for the React Link experiment. Upstream issue: https://github.com/TanStack/store/issues/372.

Unobserved computed atoms retain forward dependency revisions without leaving reverse links from their sources. Later reads/subscriptions validate those revisions and reconnect unchanged dependencies without rerunning getters. Dependency revisions preserve A → B → A writes without retaining obsolete values. Dirty computations and explicit async completion discard saved dependencies. Clean observed reads keep a short path.

The patch covers package source and both published JavaScript formats. The modified JavaScript files no longer reference the original, inaccurate source maps. No public Store API is added.

Regression coverage is in `packages/react-router/tests/store-lifetime.test.tsx`; run through Nx with `--pool=forks --execArgv=--expose-gc` to include abandoned-render and nested-error collectability checks. The standalone React reproduction is also retained in `artifacts/link-subscriptions/atom-lifetime-repro.cjs` locally.

A pnpm workspace patch does not reach consumers of published Router packages. Replace it with an upstream Store release containing the lifetime fix before publishing the Link optimization.
