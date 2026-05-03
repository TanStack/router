# @tanstack/router-plugin

## 1.167.32

### Patch Changes

- Replace global route metadata with explicit router plugin contexts so multiple router plugin instances cannot cross-transform route files. ([#7313](https://github.com/TanStack/router/pull/7313))

## 1.167.31

### Patch Changes

- Updated dependencies [[`4a1e63f`](https://github.com/TanStack/router/commit/4a1e63f1d1230b1ed8234609acad4639d8982c13)]:
  - @tanstack/router-core@1.169.1
  - @tanstack/react-router@1.169.1
  - @tanstack/router-generator@1.166.39

## 1.167.30

### Patch Changes

- Updated dependencies [[`c992495`](https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e)]:
  - @tanstack/router-core@1.169.0
  - @tanstack/react-router@1.169.0
  - @tanstack/router-generator@1.166.38

## 1.167.29

### Patch Changes

- Updated dependencies [[`b5c4183`](https://github.com/TanStack/router/commit/b5c4183ab8b44be8a75647b7f7b588ad7c146ece)]:
  - @tanstack/router-core@1.168.18
  - @tanstack/react-router@1.168.26
  - @tanstack/router-generator@1.166.37

## 1.167.28

### Patch Changes

- Updated dependencies [[`493148b`](https://github.com/TanStack/router/commit/493148bc5378b7f9de1544d87f6aaa425c12eb34)]:
  - @tanstack/router-core@1.168.17
  - @tanstack/react-router@1.168.25
  - @tanstack/router-generator@1.166.36

## 1.167.27

### Patch Changes

- Updated dependencies [[`a2ad394`](https://github.com/TanStack/router/commit/a2ad394598e2079ab4050ebb16bb03b31d69c32a)]:
  - @tanstack/router-generator@1.166.35

## 1.167.26

### Patch Changes

- refactor(router-plugin): upgrade unplugin to `v3` ([#7258](https://github.com/TanStack/router/pull/7258))

## 1.167.25

### Patch Changes

- Fix React route HMR for webpack and rspack so it no longer imports `react-refresh/runtime`, avoiding failures when that optional dependency is not installed. ([#7255](https://github.com/TanStack/router/pull/7255))

## 1.167.24

### Patch Changes

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/react-router@1.168.24
  - @tanstack/router-core@1.168.16
  - @tanstack/router-generator@1.166.34

## 1.167.23

### Patch Changes

- rsbuild ([#7228](https://github.com/TanStack/router/pull/7228))

- Updated dependencies [[`91a7089`](https://github.com/TanStack/router/commit/91a708989d00537a21911e74ff60bbfec8266295)]:
  - @tanstack/router-utils@1.161.7
  - @tanstack/router-generator@1.166.33

## 1.167.22

### Patch Changes

- Updated dependencies [[`16f6892`](https://github.com/TanStack/router/commit/16f6892d6b7ceadf606677c5a40e743f29163aa6)]:
  - @tanstack/router-core@1.168.15
  - @tanstack/react-router@1.168.21
  - @tanstack/router-generator@1.166.32

## 1.167.21

### Patch Changes

- Updated dependencies [[`328d7e5`](https://github.com/TanStack/router/commit/328d7e5ebc6b8074242a07d68ccafafb83e37a0e)]:
  - @tanstack/router-generator@1.166.31

## 1.167.20

### Patch Changes

- fix: update vite-plugin-solid peer dependency to support version 3.0.0-0 ([#7170](https://github.com/TanStack/router/pull/7170))

## 1.167.19

### Patch Changes

- Updated dependencies [[`105d056`](https://github.com/TanStack/router/commit/105d05691a247779a63e7b688aa1207cce619339)]:
  - @tanstack/router-generator@1.166.30
  - @tanstack/react-router@1.168.19

## 1.167.18

### Patch Changes

- add vite 8 to peer deps ([#7160](https://github.com/TanStack/router/pull/7160))

## 1.167.17

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/router-core@1.168.14
  - @tanstack/react-router@1.168.18
  - @tanstack/router-generator@1.166.29

## 1.167.16

### Patch Changes

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/router-core@1.168.13
  - @tanstack/react-router@1.168.17
  - @tanstack/router-generator@1.166.28

## 1.167.15

### Patch Changes

- Updated dependencies [[`8ec9ca9`](https://github.com/TanStack/router/commit/8ec9ca97b472779de878c2a6510f21deb24d386c)]:
  - @tanstack/router-core@1.168.12
  - @tanstack/react-router@1.168.16
  - @tanstack/router-generator@1.166.27

## 1.167.14

### Patch Changes

- shorten internal non-minifiable store names for byte shaving ([#7152](https://github.com/TanStack/router/pull/7152))

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/react-router@1.168.15
  - @tanstack/router-core@1.168.11
  - @tanstack/router-generator@1.166.26

## 1.167.13

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/react-router@1.168.14
  - @tanstack/router-core@1.168.10
  - @tanstack/router-generator@1.166.25

## 1.167.12

### Patch Changes

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/router-core@1.168.9
  - @tanstack/react-router@1.168.10
  - @tanstack/router-generator@1.166.24

## 1.167.11

### Patch Changes

- Updated dependencies [[`2d1ec86`](https://github.com/TanStack/router/commit/2d1ec865a446926f7db6e29dbbde82d265de6d36)]:
  - @tanstack/router-core@1.168.8
  - @tanstack/react-router@1.168.9
  - @tanstack/router-generator@1.166.23

## 1.167.10

### Patch Changes

- Initialize `import.meta.hot.data` before storing stable split components so Vitest does not crash when HMR data is missing. ([#7074](https://github.com/TanStack/router/pull/7074))

## 1.167.9

### Patch Changes

- Updated dependencies [[`6ee0e79`](https://github.com/TanStack/router/commit/6ee0e795b085651beb2f1ac6503cdbd7eaffedd1)]:
  - @tanstack/router-core@1.168.7
  - @tanstack/react-router@1.168.8
  - @tanstack/router-generator@1.166.22

## 1.167.8

### Patch Changes

- Updated dependencies [[`42c3f3b`](https://github.com/TanStack/router/commit/42c3f3b3a3a478fd6d6894310ef94b2d23794b8e)]:
  - @tanstack/router-core@1.168.6
  - @tanstack/react-router@1.168.7
  - @tanstack/router-generator@1.166.21

## 1.167.7

### Patch Changes

- Updated dependencies [[`70b2225`](https://github.com/TanStack/router/commit/70b222513720d99c6d44bd3f28d1e9b19dc91a43)]:
  - @tanstack/router-generator@1.166.20

## 1.167.6

### Patch Changes

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/router-core@1.168.5
  - @tanstack/react-router@1.168.5
  - @tanstack/router-generator@1.166.19

## 1.167.5

### Patch Changes

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/react-router@1.168.4
  - @tanstack/router-core@1.168.4
  - @tanstack/router-generator@1.166.18

## 1.167.4

### Patch Changes

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/react-router@1.168.3
  - @tanstack/router-core@1.168.3
  - @tanstack/router-generator@1.166.17

## 1.167.3

### Patch Changes

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/react-router@1.168.2
  - @tanstack/router-core@1.168.2
  - @tanstack/router-generator@1.166.16

## 1.167.2

### Patch Changes

- Fix React Fast Refresh state preservation for auto code-split route components during HMR updates. ([#7000](https://github.com/TanStack/router/pull/7000))

## 1.167.1

### Patch Changes

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/react-router@1.168.1
  - @tanstack/router-core@1.168.1
  - @tanstack/router-generator@1.166.15

## 1.167.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/react-router@1.168.0
  - @tanstack/router-core@1.168.0
  - @tanstack/router-generator@1.166.14

## 1.166.14

### Patch Changes

- Updated dependencies [[`5ff4f0b`](https://github.com/TanStack/router/commit/5ff4f0b8dce1fac2bb0b0bfe2684fc677a8ee505)]:
  - @tanstack/router-core@1.167.5
  - @tanstack/react-router@1.167.5
  - @tanstack/router-generator@1.166.13

## 1.166.13

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e)]:
  - @tanstack/router-core@1.167.4
  - @tanstack/react-router@1.167.4
  - @tanstack/virtual-file-routes@1.161.7
  - @tanstack/router-generator@1.166.12

## 1.166.12

### Patch Changes

- Updated dependencies [[`32fcba7`](https://github.com/TanStack/router/commit/32fcba7b044b03f5901308b870f70b0b4910c220)]:
  - @tanstack/router-core@1.167.3
  - @tanstack/react-router@1.167.3
  - @tanstack/router-generator@1.166.11

## 1.166.11

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/react-router@1.167.2
  - @tanstack/router-core@1.167.2
  - @tanstack/router-generator@1.166.10
  - @tanstack/router-utils@1.161.6
  - @tanstack/virtual-file-routes@1.161.6

## 1.166.10

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/virtual-file-routes@1.161.5
  - @tanstack/router-generator@1.166.9
  - @tanstack/react-router@1.167.1
  - @tanstack/router-utils@1.161.5
  - @tanstack/router-core@1.167.1

## 1.166.9

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/router-core@1.167.0
  - @tanstack/react-router@1.167.0
  - @tanstack/router-generator@1.166.8

## 1.166.8

### Patch Changes

- fix: hoist inline component definitions for proper React HMR#6919 ([#6919](https://github.com/TanStack/router/pull/6919))

- Updated dependencies [[`6069eba`](https://github.com/TanStack/router/commit/6069eba64369dbddb0d8dccdb4407f0e1a82259e)]:
  - @tanstack/react-router@1.166.8
  - @tanstack/router-generator@1.166.7
