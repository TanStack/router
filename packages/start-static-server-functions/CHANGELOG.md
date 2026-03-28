# @tanstack/start-static-server-functions

## 1.166.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-client-core@1.167.6
  - @tanstack/react-start@1.167.12
  - @tanstack/solid-start@1.167.11

## 1.166.21

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-client-core@1.167.5
  - @tanstack/react-start@1.167.9
  - @tanstack/solid-start@1.167.9

## 1.166.20

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-start@1.167.7
  - @tanstack/start-client-core@1.167.4
  - @tanstack/solid-start@1.167.7

## 1.166.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-start@1.167.5
  - @tanstack/start-client-core@1.167.3
  - @tanstack/solid-start@1.167.5

## 1.166.18

### Patch Changes

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/start-client-core@1.167.2
  - @tanstack/react-start@1.167.3
  - @tanstack/solid-start@1.167.3

## 1.166.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-start@1.167.1
  - @tanstack/start-client-core@1.167.1
  - @tanstack/solid-start@1.167.1

## 1.166.16

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/start-client-core@1.167.0
  - @tanstack/react-start@1.167.0
  - @tanstack/solid-start@1.167.0

## 1.166.15

### Patch Changes

- Updated dependencies []:
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
