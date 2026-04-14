# Playwright E2E Sharding

Use `scripts/nx/playwright-plugin.ts` to turn a Playwright e2e project into Nx shard targets.

The plugin looks for `nx.metadata.playwrightShards` in a project's `package.json`. When present, it generates:

- `test:e2e--shard-1-of-N` through `test:e2e--shard-N-of-N`
- a parent `test:e2e` target that depends on all shard targets

Each shard target runs Playwright with:

- `--shard=<index>/<count>`
- a shard-specific `E2E_PORT_KEY`
- a dependency on `build` and `^build`

## 1. Enable sharding in `package.json`

```json
{
  "name": "tanstack-react-start-e2e-rsc",
  "nx": {
    "metadata": {
      "playwrightShards": 6
    }
  }
}
```

The package name is used to build the shard port key:

```txt
<package-name>-shard-<index>-of-<count>
```

## 2. Do not build inside `playwright.config.ts`

The plugin already makes each shard depend on `build`, so the Playwright `webServer` command should only start the built app.

Good:

```ts
webServer: {
  command: `PORT=${PORT} pnpm start`,
  url: baseURL,
}
```

Avoid:

```ts
webServer: {
  command: `PORT=${PORT} pnpm build && PORT=${PORT} pnpm start`,
  url: baseURL,
}
```

Running the build inside every shard causes unnecessary work and can create races when multiple shards share the same project directory.

## 3. Use `E2E_PORT_KEY` for every derived port

If the project uses `getTestServerPort`, `getDummyServerPort`, `e2eStartDummyServer`, or `e2eStopDummyServer`, key them off `process.env.E2E_PORT_KEY` first.

Example:

```ts
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from './package.json' with { type: 'json' }

const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name
const PORT = await getTestServerPort(e2ePortKey)
```

Dummy server setup/teardown should use the same key:

```ts
await e2eStartDummyServer(process.env.E2E_PORT_KEY ?? packageJson.name)
await e2eStopDummyServer(process.env.E2E_PORT_KEY ?? packageJson.name)
```

Without this, multiple shards on the same runner will reuse the same `port-*.txt` files and tear each other down.

## 4. Clean stale port files once per Playwright run

If the project allocates ports through `@tanstack/router-e2e-utils`, clean stale `port-*.txt` files before resolving the port.

Important: do this only in the main Playwright config load. Playwright loads the config more than once, and unconditional cleanup can remap the port after the web server has already started.

Example:

```ts
import fs from 'node:fs'
import packageJson from './package.json' with { type: 'json' }

const e2ePortKey = process.env.E2E_PORT_KEY ?? packageJson.name

if (process.env.TEST_WORKER_INDEX === undefined) {
  for (const portFile of [
    `port-${e2ePortKey}.txt`,
    `port-${e2ePortKey}-external.txt`,
  ]) {
    fs.rmSync(portFile, { force: true })
  }
}
```

Avoid broad cleanup such as `rm -rf port*.txt` in shared shard runs.

## 5. Keep the base URL derived from the shard key

```ts
const PORT = await getTestServerPort(e2ePortKey)
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  use: {
    baseURL,
  },
  webServer: {
    command: `PORT=${PORT} pnpm start`,
    url: baseURL,
  },
})
```

## 6. Run the generated targets

Examples:

```sh
pnpm nx run tanstack-react-start-e2e-rsc:test:e2e--shard-1-of-6
pnpm nx run tanstack-react-start-e2e-rsc:test:e2e
```

## Checklist

- add `nx.metadata.playwrightShards` to `package.json`
- make sure the project has a working `build` target
- remove `build` from `webServer.command`
- read ports from `process.env.E2E_PORT_KEY ?? packageJson.name`
- use the same key for helper servers in setup and teardown
- clean shard-specific `port-*.txt` files once, guarded by `TEST_WORKER_INDEX === undefined`
- avoid wildcard port cleanup in shared shard runs

## Reference

Working example:

- `e2e/react-start/rsc/package.json`
- `e2e/react-start/rsc/playwright.config.ts`
- `e2e/react-start/rsc/tests/setup/global.setup.ts`
- `e2e/react-start/rsc/tests/setup/global.teardown.ts`
