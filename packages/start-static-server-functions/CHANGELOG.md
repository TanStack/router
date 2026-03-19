# @tanstack/start-static-server-functions

## 2.0.0-alpha.2

## 1.166.15

### Patch Changes

- Updated dependencies []:
  - @tanstack/solid-start@2.0.0-alpha.2

## 2.0.0-alpha.1

### Patch Changes

- Updated dependencies [[`4c5bb71`](https://github.com/TanStack/router/commit/4c5bb71d320df8aa9cb41a67103b671335a1bb7d)]:
  - @tanstack/solid-start@2.0.0-alpha.1

## 2.0.0-alpha.0

### Patch Changes

- Updated dependencies [[`a0191af`](https://github.com/TanStack/router/commit/a0191afd21afe0e7571af8b0faab171f62e71db7)]:
  - @tanstack/solid-start@2.0.0-alpha.0

  - @tanstack/start-client-core@1.166.13
  - @tanstack/react-start@1.166.17
  - @tanstack/solid-start@1.166.17

## 1.166.14

### Patch Changes

- fix: write static server function cache to correct output directory when using Nitro ([#6940](https://github.com/TanStack/router/pull/6940))

  `TSS_CLIENT_OUTPUT_DIR` was baked in via Vite's `define` at config time, before Nitro's `configEnvironment` hook changed the client `build.outDir`. This caused `staticServerFnCache` files to be written to `dist/client/` instead of the Nitro-managed `.output/public/` directory.

  Now `TSS_CLIENT_OUTPUT_DIR` is set as a runtime environment variable during prerendering using the resolved client output directory, so it correctly reflects any output directory changes made by deployment adapters like Nitro.

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/react-start@1.166.15
  - @tanstack/solid-start@1.166.15
  - @tanstack/start-client-core@1.166.12

## 1.166.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-client-core@1.166.11
  - @tanstack/react-start@1.166.14
  - @tanstack/solid-start@1.166.14

## 1.166.12

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/react-start@1.166.13
  - @tanstack/solid-start@1.166.13
  - @tanstack/start-client-core@1.166.10

## 1.166.11

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/start-client-core@1.166.9
  - @tanstack/react-start@1.166.12
  - @tanstack/solid-start@1.166.12

## 1.166.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-client-core@1.166.8
  - @tanstack/react-start@1.166.10
  - @tanstack/solid-start@1.166.10

## 1.166.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-start@1.166.8
  - @tanstack/solid-start@1.166.8
