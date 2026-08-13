# @tanstack/solid-router-ssr-query

## 2.0.0-rc.0

### Patch Changes

- [#8058](https://github.com/TanStack/router/pull/8058) [`56cc90e`](https://github.com/TanStack/router/commit/56cc90ea2c29b8d8c3aa21252b60f0995083b713) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-rc.0`, and migrate from `vite-plugin-solid` to its new name `@solidjs/vite-plugin` at `3.0.0-next.28`

  `vite-plugin-solid` was renamed to `@solidjs/vite-plugin`; its final release (`3.0.0-next.27`) is a re-export shim over the new package. `@solidjs/vite-plugin@3.0.0-next.28` requires `solid-js`/`@solidjs/web` `^2.0.0-rc.0`, so the rename and the `rc` bump land together.

  `@tanstack/router-plugin` is intentionally untouched: it detects the Solid JSX plugin by its Vite plugin _name_ (`solid`), which the renamed package still registers, and its `vite-plugin-solid` peer is optional — so it keeps working for both Solid 1 and Solid 2 consumers without a change.

  Also bumps `@tanstack/solid-query` and `@tanstack/solid-query-devtools` to `^6.0.0-rc.0` (whose peer requires `solid-js >=2.0.0-rc.0`), and converges `@tanstack/query-core` on `5.101.4` — `solid-query` depends on query-core `5.101.0`, which previously resolved to a stale `5.99.0` and produced two incompatible `QueryClient` types.

## 2.0.0-beta.31

### Patch Changes

- [#8014](https://github.com/TanStack/router/pull/8014) [`980ed57`](https://github.com/TanStack/router/commit/980ed5794acd88b8dccf8e2969ecdf9106ff7b0a) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.32`

## 2.0.0-beta.30

### Patch Changes

- [#7928](https://github.com/TanStack/router/pull/7928) [`3d40733`](https://github.com/TanStack/router/commit/3d40733d4a053dfde499f9f0b55cf7c1d5624915) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.29`

## 2.0.0-beta.29

### Patch Changes

- [#7916](https://github.com/TanStack/router/pull/7916) [`84c43e0`](https://github.com/TanStack/router/commit/84c43e0595c4f5b69291bf75a6e380c47543d319) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.27`

## 2.0.0-beta.28

### Patch Changes

- [#7888](https://github.com/TanStack/router/pull/7888) [`a7e9835`](https://github.com/TanStack/router/commit/a7e9835e1c333688bde4da482745f50d9c5a7f8c) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.25`

## 2.0.0-beta.27

### Patch Changes

- [#7865](https://github.com/TanStack/router/pull/7865) [`714e11f`](https://github.com/TanStack/router/commit/714e11f1915d3356134bea1ed8ab74617d91f55b) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.21`

## 2.0.0-beta.26

### Patch Changes

- [#7850](https://github.com/TanStack/router/pull/7850) [`62f3b26`](https://github.com/TanStack/router/commit/62f3b2697f6da8d495af880d808064dc10962786) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.20`

## 2.0.0-beta.25

### Patch Changes

- [#7813](https://github.com/TanStack/router/pull/7813) [`ebe104c`](https://github.com/TanStack/router/commit/ebe104c01c35229d755458febe8ea40fb446a482) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.17`

- [#7813](https://github.com/TanStack/router/pull/7813) [`ebe104c`](https://github.com/TanStack/router/commit/ebe104c01c35229d755458febe8ea40fb446a482) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.18`

- [#7813](https://github.com/TanStack/router/pull/7813) [`ebe104c`](https://github.com/TanStack/router/commit/ebe104c01c35229d755458febe8ea40fb446a482) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.19` and `vite-plugin-solid` to `3.0.0-next.11`

## 2.0.0-beta.24

### Patch Changes

- [#7702](https://github.com/TanStack/router/pull/7702) [`e56bb22`](https://github.com/TanStack/router/commit/e56bb22fc3924a6ba189955d27b4b8fa49ad5c92) - Upgrade `@tanstack/solid-query` to `6.0.0-beta.5`

## 2.0.0-beta.23

### Patch Changes

- [#7688](https://github.com/TanStack/router/pull/7688) [`259efbe`](https://github.com/TanStack/router/commit/259efbe5301df3246f1a13dd7eece24f1d3038f9) - Upgrade `solid-js` and `@solidjs/web` to `2.0.0-beta.15`

## 2.0.0-beta.22

### Patch Changes

- [#7532](https://github.com/TanStack/router/pull/7532) [`ff136aa`](https://github.com/TanStack/router/commit/ff136aaea6f03446fb5aedc17319974106b72165) - fix: use TSR_DEFERRED_PROMISE

## 2.0.0-beta.21

### Patch Changes

- [#7528](https://github.com/TanStack/router/pull/7528) [`440a0c9`](https://github.com/TanStack/router/commit/440a0c92708c977d146e694fe828707dc7e61c3f) - sync main

## 2.0.0-beta.20

### Patch Changes

- Fix two related issues with HeadContent in solid-router ([#7510](https://github.com/TanStack/router/pull/7510))

## 2.0.0-beta.19

### Patch Changes

- Upgrade to solidjs beta 14 ([#7415](https://github.com/TanStack/router/pull/7415))

## 2.0.0-beta.18

### Patch Changes

- Upgrade to solid v2 beta 10 ([#7284](https://github.com/TanStack/router/pull/7284))

## 2.0.0-beta.17

### Patch Changes

- Update to solid v2 beta 8 ([#7241](https://github.com/TanStack/router/pull/7241))

## 2.0.0-beta.16

### Patch Changes

- chore: bump solid 2 to beta.7 ([#7210](https://github.com/TanStack/router/pull/7210))

## 2.0.0-beta.15

### Patch Changes

- fix: pin solid 2 beta.6 due to server range with -experimental tag ([#7171](https://github.com/TanStack/router/pull/7171))

## 2.0.0-beta.14

### Patch Changes

- Upgrade to Solid v2.0.0-beta.6 ([#7145](https://github.com/TanStack/router/pull/7145))

## 2.0.0-beta.13

### Patch Changes

- fix: adjust pre-release ranges ([#7130](https://github.com/TanStack/router/pull/7130))

## 2.0.0-beta.12

### Patch Changes

- chore: sync main to pre-release branch ([#7106](https://github.com/TanStack/router/pull/7106))

## 2.0.0-alpha.11

### Patch Changes

- chore: bump solid-query and vite-plugin-solid ([#7103](https://github.com/TanStack/router/pull/7103))

## 2.0.0-alpha.10

### Patch Changes

- Upgrade to Solid 2.0.0-beta.5 ([#7102](https://github.com/TanStack/router/pull/7102))

## 2.0.0-alpha.9

### Patch Changes

- chore: bump solid-query to 6.0.0-alpha.2 ([#7020](https://github.com/TanStack/router/pull/7020))

## 2.0.0-alpha.8

### Patch Changes

- chore: bump solid-query to 6.0.0-alpha.1 ([#7016](https://github.com/TanStack/router/pull/7016))

## 2.0.0-alpha.7

### Patch Changes

- chore: sync main branch with store refactor ([#7001](https://github.com/TanStack/router/pull/7001))

## 2.0.0-alpha.6

### Patch Changes

- Update to beta.4 ([#6991](https://github.com/TanStack/router/pull/6991))

## 2.0.0-alpha.5

### Patch Changes

- fix: use solid-query 6.0.0-alpha.0 ([#6989](https://github.com/TanStack/router/pull/6989))

## 2.0.0-alpha.4

### Patch Changes

- fix: add vite 8 compat ([`dfd64e4`](https://github.com/TanStack/router/commit/dfd64e4a08e74ef292c6bd7baab77283c258bb92))

## 2.0.0-alpha.3

### Patch Changes

- fix: use solid v2 compatible solid-query ([#6938](https://github.com/TanStack/router/pull/6938))

## 2.0.0-alpha.2

### Patch Changes

- build: bundle packages with rolldown ([#6931](https://github.com/TanStack/router/pull/6931))

## 2.0.0-alpha.1

### Patch Changes

- bump to alpha.1 ([`4c5bb71`](https://github.com/TanStack/router/commit/4c5bb71d320df8aa9cb41a67103b671335a1bb7d))

- Updated dependencies [[`4c5bb71`](https://github.com/TanStack/router/commit/4c5bb71d320df8aa9cb41a67103b671335a1bb7d)]:
  - @tanstack/solid-router@2.0.0-alpha.1

## 2.0.0-alpha.0

### Major Changes

- solid v2 pre-release for solid-router and start ([#6904](https://github.com/TanStack/router/pull/6904))

### Patch Changes

- Updated dependencies [[`a0191af`](https://github.com/TanStack/router/commit/a0191afd21afe0e7571af8b0faab171f62e71db7)]:
  - @tanstack/solid-router@2.0.0-alpha.0

## 1.167.1

### Patch Changes

- Updated dependencies [[`d1997b6`](https://github.com/TanStack/router/commit/d1997b66d7c24c1d64772bb8bab5caf9c6d9cc48)]:
  - @tanstack/router-ssr-query-core@1.169.1

## 1.167.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

### Patch Changes

- Updated dependencies [[`201e150`](https://github.com/TanStack/router/commit/201e150bd1412bae2faa9ce53f0fefcb7574ac14)]:
  - @tanstack/router-ssr-query-core@1.169.0

## 1.166.12

### Patch Changes

- Updated dependencies [[`b12f57b`](https://github.com/TanStack/router/commit/b12f57bbb44e47d5452d46e9e67ea4d63cdb5b55)]:
  - @tanstack/router-ssr-query-core@1.168.0

## 1.166.11

### Patch Changes

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/router-ssr-query-core@1.167.1

## 1.166.10

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/router-ssr-query-core@1.167.0

## 1.166.9

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/router-ssr-query-core@1.166.9

## 1.166.8

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/router-ssr-query-core@1.166.8
