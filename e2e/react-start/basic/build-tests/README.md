# Build integration tests

These Node.js tests exercise production builds and inspect their network and
filesystem effects. They run separately from the browser tests in `tests/`.

Run the suite from the repository root:

```sh
pnpm nx run tanstack-react-start-e2e-basic:test:build
```

The target participates in `pnpm test:build`, `pnpm test:ci`, and affected PR
checks. Nx builds workspace dependencies first; each test owns its application
build, so the target does not depend on the normal application `build` target.
No Playwright browser or application web server is required.

The crawl test starts a local HTTP listener before building to detect requests
to another origin. It enables prerendering through `E2E_PRERENDER_CRAWL_ORIGIN`
and writes to a temporary directory under the fixture's `node_modules`, keeping
server dependencies resolvable and generated files outside the TypeScript check.
The suite allows 120 seconds per test, including the build and type check; the
build process has a shorter 100-second timeout to leave time for cleanup.
