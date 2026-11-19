# Vitest tests of a Start app

A TanStack Start app that tests its own code with Vitest. `tanstackStart()` is in the config Vitest loads, and `vite.config.ts` has a browser, a jsdom and a Node project.

## Running the tests

```sh
pnpm nx run tanstack-react-start-e2e-vitest-app:test:e2e
```

`test:e2e` runs in a copy of the project whose `@tanstack/*` packages are installed as in a user's project. The copy type-checks the project and then runs the tests twice, first with an empty Vitest cache and then from the warm cache.

[Running an e2e project as an installed project](../../../scripts/e2e/run-as-installed.md) explains why the tests run in a copy and how the copy is made.

## Running Vitest in this directory

```sh
pnpm vitest run
```

The first run after an install fails one browser test file, and the second run passes. The failure looks like this:

```
[vitest] Vite unexpectedly reloaded a test.
Error: Failed to import test file …/tests/route-tree.client.test.tsx
Caused by: TypeError: Failed to fetch dynamically imported module
```

In this directory `@tanstack/*` are links to `packages/*`. Vite sees what those packages import (`seroval`, `cookie-es`) only when a test loads them. It pre-bundles them then and reloads the page, and the test file that was loading fails to import. Vite keeps the pre-bundle in `node_modules/.vite`, so later runs pass until that directory is removed.

A user's project does not have this problem, and neither does the copy that `test:e2e` uses: Vite pre-bundles nothing late for a package inside `node_modules`. The [table of the two layouts](../../../scripts/e2e/run-as-installed.md#why) has the details.

A run in this directory uses the built packages, so build them first (`test:e2e` does that through Nx).
