# @tanstack/start-plugin-core

## 1.167.25

### Patch Changes

- Reuse previously discovered server function IDs across compiler instances so custom `generateFunctionId` values stay stable when duplicate IDs are deduplicated during build. ([#7153](https://github.com/TanStack/router/pull/7153))

  This fixes cases where different build environments could assign different deduped IDs to the same server functions, which could cause requests to resolve to the wrong handler.

## 1.167.24

### Patch Changes

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/start-server-core@1.167.15
  - @tanstack/router-plugin@1.167.14
  - @tanstack/router-core@1.168.11
  - @tanstack/router-generator@1.166.26
  - @tanstack/start-client-core@1.167.13

## 1.167.23

### Patch Changes

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/start-client-core@1.167.12
  - @tanstack/start-server-core@1.167.14
  - @tanstack/router-plugin@1.167.13
  - @tanstack/router-core@1.168.10
  - @tanstack/router-generator@1.166.25

## 1.167.22

### Patch Changes

- Updated dependencies [[`f8ac427`](https://github.com/TanStack/router/commit/f8ac427000c3fec99225926e72f9f2fc7a37231f)]:
  - @tanstack/start-server-core@1.167.13
  - @tanstack/start-client-core@1.167.11

## 1.167.21

### Patch Changes

- fix publishing ([`2d53c05`](https://github.com/TanStack/router/commit/2d53c056ef0b203de8a28bc92c24e8e604205d52))

- Updated dependencies [[`2d53c05`](https://github.com/TanStack/router/commit/2d53c056ef0b203de8a28bc92c24e8e604205d52)]:
  - @tanstack/start-server-core@1.167.12

## 1.167.19

### Patch Changes

- Republish the React Start RSC package chain so fresh installs resolve a `start-plugin-core` build that exports the subpaths used by `react-start-rsc`. ([`3384abc`](https://github.com/TanStack/router/commit/3384abcffd98a68eb254b11221834bcbcdebec31))

## 1.167.18

### Patch Changes

- Updated dependencies [[`f7e9c5e`](https://github.com/TanStack/router/commit/f7e9c5e323793d1b28c96871819c265fd28ae397)]:
  - @tanstack/start-client-core@1.167.10
  - @tanstack/start-server-core@1.167.10

## 1.167.17

### Patch Changes

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/router-core@1.168.9
  - @tanstack/router-generator@1.166.24
  - @tanstack/router-plugin@1.167.12
  - @tanstack/start-client-core@1.167.9
  - @tanstack/start-server-core@1.167.9

## 1.167.16

### Patch Changes

- Updated dependencies [[`2d1ec86`](https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36)]:
  - @tanstack/router-core@1.168.8
  - @tanstack/router-generator@1.166.23
  - @tanstack/router-plugin@1.167.11
  - @tanstack/start-client-core@1.167.8
  - @tanstack/start-server-core@1.167.8

## 1.167.15

### Patch Changes

- Updated dependencies [[`f8351a8`](https://github.com/TanStack/router/commit/f8351a8d7aa9f5a341377f96966451892acb39f1)]:
  - @tanstack/router-plugin@1.167.10

## 1.167.14

### Patch Changes

- Updated dependencies [[`6ee0e79`](https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1)]:
  - @tanstack/router-core@1.168.7
  - @tanstack/router-generator@1.166.22
  - @tanstack/router-plugin@1.167.9
  - @tanstack/start-client-core@1.167.7
  - @tanstack/start-server-core@1.167.7

## 1.167.13

### Patch Changes

- Updated dependencies [[`42c3f3b`](https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e)]:
  - @tanstack/router-core@1.168.6
  - @tanstack/router-generator@1.166.21
  - @tanstack/router-plugin@1.167.8
  - @tanstack/start-client-core@1.167.6
  - @tanstack/start-server-core@1.167.6

## 1.167.12

### Patch Changes

- Updated dependencies [[`70b2225`](https://github.com/TanStack/router/commit/70b222513720d99c6d44bd3f28d1e9b19dc91a43)]:
  - @tanstack/router-generator@1.166.20
  - @tanstack/router-plugin@1.167.7

## 1.167.11

### Patch Changes

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/router-core@1.168.5
  - @tanstack/router-generator@1.166.19
  - @tanstack/router-plugin@1.167.6
  - @tanstack/start-client-core@1.167.5
  - @tanstack/start-server-core@1.167.5

## 1.167.10

### Patch Changes

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/router-core@1.168.4
  - @tanstack/router-generator@1.166.18
  - @tanstack/router-plugin@1.167.5
  - @tanstack/start-client-core@1.167.4
  - @tanstack/start-server-core@1.167.4

## 1.167.9

### Patch Changes

- Deduplicate CSS assets in the Start manifest so shared stylesheets are not repeated within a route entry or across an active parent-child route chain. ([#7030](https://github.com/TanStack/router/pull/7030))

## 1.167.8

### Patch Changes

- feat: transformAssets ([#7023](https://github.com/TanStack/router/pull/7023))

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/router-core@1.168.3
  - @tanstack/start-server-core@1.167.3
  - @tanstack/router-generator@1.166.17
  - @tanstack/router-plugin@1.167.4
  - @tanstack/start-client-core@1.167.3

## 1.167.7

### Patch Changes

- fix: streaming in vite preview ([#6828](https://github.com/TanStack/router/pull/6828))

## 1.167.6

### Patch Changes

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/start-client-core@1.167.2
  - @tanstack/start-server-core@1.167.2
  - @tanstack/router-core@1.168.2
  - @tanstack/router-generator@1.166.16
  - @tanstack/router-plugin@1.167.3

## 1.167.5

### Patch Changes

- Updated dependencies [[`9351e99`](https://github.com/TanStack/router/commit/9351e997962d02ecc3f6f1791edd84e64361d27b)]:
  - @tanstack/router-plugin@1.167.2

## 1.167.4

### Patch Changes

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/router-core@1.168.1
  - @tanstack/router-generator@1.166.15
  - @tanstack/router-plugin@1.167.1
  - @tanstack/start-client-core@1.167.1
  - @tanstack/start-server-core@1.167.1

## 1.167.3

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/start-client-core@1.167.0
  - @tanstack/start-server-core@1.167.0
  - @tanstack/router-plugin@1.167.0
  - @tanstack/router-core@1.168.0
  - @tanstack/router-generator@1.166.14

## 1.167.2

### Patch Changes

- fix(start-plugin-core): fix Vite 7/8 compat for bundler options ([#6985](https://github.com/TanStack/router/pull/6985))

## 1.167.1

### Patch Changes

- Updated dependencies [[`5ff4f0b`](https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505)]:
  - @tanstack/router-core@1.167.5
  - @tanstack/router-generator@1.166.13
  - @tanstack/router-plugin@1.166.14
  - @tanstack/start-client-core@1.166.13
  - @tanstack/start-server-core@1.166.13

## 1.167.0

### Minor Changes

- Support both Vite 7 (`rollupOptions`) and Vite 8 (`rolldownOptions`) by detecting the Vite version at runtime ([#6955](https://github.com/TanStack/router/pull/6955))

## 1.166.15

### Patch Changes

- fix: write static server function cache to correct output directory when using Nitro ([#6940](https://github.com/TanStack/router/pull/6940))

  `TSS_CLIENT_OUTPUT_DIR` was baked in via Vite's `define` at config time, before Nitro's `configEnvironment` hook changed the client `build.outDir`. This caused `staticServerFnCache` files to be written to `dist/client/` instead of the Nitro-managed `.output/public/` directory.

  Now `TSS_CLIENT_OUTPUT_DIR` is set as a runtime environment variable during prerendering using the resolved client output directory, so it correctly reflects any output directory changes made by deployment adapters like Nitro.

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/router-core@1.167.4
  - @tanstack/router-plugin@1.166.13
  - @tanstack/start-client-core@1.166.12
  - @tanstack/start-server-core@1.166.12
  - @tanstack/router-generator@1.166.12

## 1.166.14

### Patch Changes

- Updated dependencies [[`32fcba7`](https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220)]:
  - @tanstack/router-core@1.167.3
  - @tanstack/router-generator@1.166.11
  - @tanstack/router-plugin@1.166.12
  - @tanstack/start-client-core@1.166.11
  - @tanstack/start-server-core@1.166.11

## 1.166.13

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/router-core@1.167.2
  - @tanstack/router-generator@1.166.10
  - @tanstack/router-plugin@1.166.11
  - @tanstack/router-utils@1.161.6
  - @tanstack/start-client-core@1.166.10
  - @tanstack/start-server-core@1.166.10

## 1.166.12

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/start-client-core@1.166.9
  - @tanstack/start-server-core@1.166.9
  - @tanstack/router-generator@1.166.9
  - @tanstack/router-plugin@1.166.10
  - @tanstack/router-utils@1.161.5
  - @tanstack/router-core@1.167.1

## 1.166.11

### Patch Changes

- fix: add `xmlns:xhtml` to generated sitemap ([#6920](https://github.com/TanStack/router/pull/6920))

## 1.166.10

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/router-core@1.167.0
  - @tanstack/router-generator@1.166.8
  - @tanstack/router-plugin@1.166.9
  - @tanstack/start-client-core@1.166.8
  - @tanstack/start-server-core@1.166.8

## 1.166.9

### Patch Changes

- Updated dependencies [[`6069eba`](https://github.com/TanStack/router/commit/6069eba64369dbddb0d8dccdb4407f0e1a82259e)]:
  - @tanstack/router-plugin@1.166.8
  - @tanstack/router-generator@1.166.7

## 1.166.8

### Patch Changes

- fix: keep CSS when referenced both statically and dynamically ([#6891](https://github.com/TanStack/router/pull/6891))
