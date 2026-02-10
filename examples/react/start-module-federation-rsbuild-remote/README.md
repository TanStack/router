# TanStack Start - Module Federation Remote (Rsbuild)

This example is the **remote app** used by the host example:

- `../start-module-federation-rsbuild-host`

It exposes:

- `mf_remote/message`

via `@module-federation/rsbuild-plugin`, and serves chunks over HTTP.

## Run

```sh
pnpm install
pnpm build
pnpm preview --port 3001
```
