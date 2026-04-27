# @tanstack/start-plugin-core

## 1.169.5

### Patch Changes

- Updated dependencies [[`a2ad394`](https://github.com/TanStack/router/commit/a2ad394598e2079ab4050ebb16bb03b31d69c32a)]:
  - @tanstack/router-generator@1.166.35
  - @tanstack/router-plugin@1.167.27

## 1.169.4

### Patch Changes

- Updated dependencies [[`8b97002`](https://github.com/TanStack/router/commit/8b97002af3f6d15204e60c55d3f5735b78bd7efe), [`8b97002`](https://github.com/TanStack/router/commit/8b97002af3f6d15204e60c55d3f5735b78bd7efe)]:
  - @tanstack/start-client-core@1.167.19
  - @tanstack/router-plugin@1.167.26
  - @tanstack/start-server-core@1.167.21

## 1.169.3

### Patch Changes

- Updated dependencies [[`1e371b6`](https://github.com/TanStack/router/commit/1e371b60f1832c158ff4953a4ae6c5ccfe8460b3)]:
  - @tanstack/router-plugin@1.167.25

## 1.169.2

### Patch Changes

- Add TanStack Start inline CSS manifest support for SSR so route styles can be embedded in the HTML response and hydrated without duplicate stylesheet links. ([#7253](https://github.com/TanStack/router/pull/7253))

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/router-core@1.168.16
  - @tanstack/start-server-core@1.167.20
  - @tanstack/router-generator@1.166.34
  - @tanstack/router-plugin@1.167.24
  - @tanstack/start-client-core@1.167.18

## 1.169.1

### Patch Changes

- Fix CSS asset ordering so styles from imported chunks are emitted before route chunk styles. ([#7251](https://github.com/TanStack/router/pull/7251))

## 1.169.0

### Minor Changes

- Split Start plugin core bundler APIs into explicit Vite and Rsbuild subpaths so projects only need the bundler they use. Mark both `vite` and `@rsbuild/core` peers as optional where Start exposes both integrations. ([#7249](https://github.com/TanStack/router/pull/7249))

## 1.168.0

### Minor Changes

- rsbuild ([#7228](https://github.com/TanStack/router/pull/7228))

### Patch Changes

- Updated dependencies [[`91a7089`](https://github.com/TanStack/router/commit/91a708989d00537a21911e74ff60bbfec8266295)]:
  - @tanstack/router-plugin@1.167.23
  - @tanstack/router-utils@1.161.7
  - @tanstack/router-generator@1.166.33

## 1.167.35

### Patch Changes

- Fix missing CSS module assets in TanStack Start production manifests when Vite `build.cssCodeSplit` is disabled. ([#7191](https://github.com/TanStack/router/pull/7191))

## 1.167.34

### Patch Changes

- Updated dependencies [[`16f6892`](https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6)]:
  - @tanstack/router-core@1.168.15
  - @tanstack/router-generator@1.166.32
  - @tanstack/router-plugin@1.167.22
  - @tanstack/start-client-core@1.167.17
  - @tanstack/start-server-core@1.167.19

## 1.167.33

### Patch Changes

- Fix Start virtual module resolution in pnpm workspaces by serving the client entry through a real Vite virtual module. ([#7178](https://github.com/TanStack/router/pull/7178))

  Simplify Start virtual module handling by sharing a single `createVirtualModule` helper and collapsing internal `@tanstack/start-plugin-core` imports to the root export surface.

## 1.167.32

### Patch Changes

- Updated dependencies [[`328d7e5`](https://github.com/TanStack/router/commit/328d7e5ebc6b8074242a07d68ccafafb83e37a0e)]:
  - @tanstack/router-generator@1.166.31
  - @tanstack/router-plugin@1.167.21

## 1.167.31

### Patch Changes

- Updated dependencies [[`96ac2d8`](https://github.com/TanStack/router/commit/96ac2d8ed378340d63b88afeec3633e56e29b5f8)]:
  - @tanstack/router-plugin@1.167.20

## 1.167.30

### Patch Changes

- Updated dependencies [[`105d056`](https://github.com/TanStack/router/commit/105d05691a247779a63e7b688aa1207cce619339)]:
  - @tanstack/router-generator@1.166.30
  - @tanstack/router-plugin@1.167.19

## 1.167.29

### Patch Changes

- Updated dependencies [[`656a2a0`](https://github.com/TanStack/router/commit/656a2a040e79df7721d776e3751c8d634666570b)]:
  - @tanstack/router-plugin@1.167.18

## 1.167.28

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/start-server-core@1.167.18
  - @tanstack/router-core@1.168.14
  - @tanstack/router-generator@1.166.29
  - @tanstack/router-plugin@1.167.17
  - @tanstack/start-client-core@1.167.16

## 1.167.27

### Patch Changes

- Reduce React Start SSR manifest payload size by omitting unmatched route assets from dehydrated router state while keeping start-manifest asset serialization deduplicated by shared object identity. ([#7157](https://github.com/TanStack/router/pull/7157))

  This improves SSR HTML size for apps with many routes that share the same CSS assets and adds regression coverage for CSS module hydration, navigation, and start-manifest asset reuse.

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/router-core@1.168.13
  - @tanstack/start-server-core@1.167.17
  - @tanstack/router-generator@1.166.28
  - @tanstack/router-plugin@1.167.16
  - @tanstack/start-client-core@1.167.15

## 1.167.26

### Patch Changes

- Updated dependencies [[`8ec9ca9`](https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c)]:
  - @tanstack/router-core@1.168.12
  - @tanstack/router-generator@1.166.27
  - @tanstack/router-plugin@1.167.15
  - @tanstack/start-client-core@1.167.14
  - @tanstack/start-server-core@1.167.16

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
