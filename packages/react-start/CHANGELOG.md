# @tanstack/react-start

## 1.167.61

### Patch Changes

- Updated dependencies [[`709627f`](https://github.com/TanStack/router/commit/709627f3dbc6d97daa547a1401ef42a53bc4be32)]:
  - @tanstack/start-server-core@1.167.28
  - @tanstack/react-start-server@1.166.50
  - @tanstack/react-start-rsc@0.0.40
  - @tanstack/start-plugin-core@1.169.16

## 1.167.60

### Patch Changes

- Add experimental HTTP 103 Early Hints support to Start server handlers. ([#7324](https://github.com/TanStack/router/pull/7324))

- Updated dependencies [[`238ea4a`](https://github.com/TanStack/router/commit/238ea4a4998ab3a7fd528b317e1935766ac65df8)]:
  - @tanstack/start-server-core@1.167.27
  - @tanstack/react-start-server@1.166.49
  - @tanstack/react-start-rsc@0.0.39
  - @tanstack/start-plugin-core@1.169.15

## 1.167.59

### Patch Changes

- Updated dependencies [[`96818b8`](https://github.com/TanStack/router/commit/96818b8ba5ead6f1f027094841330182aff415b2)]:
  - @tanstack/start-plugin-core@1.169.14
  - @tanstack/react-start-rsc@0.0.38

## 1.167.58

### Patch Changes

- Add compiler-driven RSC CSS auto-injection for Start RSC render APIs and wire it into the React Start Vite and Rsbuild adapters. This ensures same-file CSS module dependencies are discovered for `renderServerComponent`, `createCompositeComponent`, and JSX-based `renderToReadableStream` calls. ([#7310](https://github.com/TanStack/router/pull/7310))

  Also add a configurable server function provider module directive hook used by the React Rsbuild RSC adapter to emit `"use server-entry"` only for extracted provider files.

- Updated dependencies [[`ae453b7`](https://github.com/TanStack/router/commit/ae453b78624cac1b574f0d1efbfbf6ca03922c6c)]:
  - @tanstack/react-start-rsc@0.0.37
  - @tanstack/start-plugin-core@1.169.13

## 1.167.57

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.169.1
  - @tanstack/react-start-client@1.166.47
  - @tanstack/react-start-rsc@0.0.36
  - @tanstack/react-start-server@1.166.48
  - @tanstack/start-client-core@1.168.1
  - @tanstack/start-plugin-core@1.169.12
  - @tanstack/start-server-core@1.167.26

## 1.167.56

### Patch Changes

- Updated dependencies [[`82b0613`](https://github.com/TanStack/router/commit/82b06132af776f74603ab27977cc277d6219a845)]:
  - @tanstack/start-client-core@1.168.0
  - @tanstack/react-start-client@1.166.46
  - @tanstack/react-start-rsc@0.0.35
  - @tanstack/react-start-server@1.166.47
  - @tanstack/start-plugin-core@1.169.11
  - @tanstack/start-server-core@1.167.25

## 1.167.55

### Patch Changes

- Updated dependencies [[`c4256c2`](https://github.com/TanStack/router/commit/c4256c2c857f392d2031cf87821e4c36a92d0382)]:
  - @tanstack/start-plugin-core@1.169.10
  - @tanstack/react-start-rsc@0.0.34

## 1.167.54

### Patch Changes

- Updated dependencies [[`761fcc0`](https://github.com/TanStack/router/commit/761fcc0c96dd96721b533a1fd9e2c972f222ef94)]:
  - @tanstack/start-plugin-core@1.169.9
  - @tanstack/react-start-rsc@0.0.33

## 1.167.53

### Patch Changes

- fix exports for react-start so useServerFn is available with RSC ([#7292](https://github.com/TanStack/router/pull/7292))

- Updated dependencies [[`c992495`](https://github.com/TanStack/router/commit/c992495bf4010ff4c3597bb1f3b1ba02594e857e)]:
  - @tanstack/react-router@1.169.0
  - @tanstack/react-start-client@1.166.45
  - @tanstack/react-start-rsc@0.0.32
  - @tanstack/react-start-server@1.166.46
  - @tanstack/start-client-core@1.167.22
  - @tanstack/start-plugin-core@1.169.8
  - @tanstack/start-server-core@1.167.24

## 1.167.52

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.26
  - @tanstack/react-start-client@1.166.44
  - @tanstack/react-start-rsc@0.0.31
  - @tanstack/react-start-server@1.166.45
  - @tanstack/start-client-core@1.167.21
  - @tanstack/start-plugin-core@1.169.7
  - @tanstack/start-server-core@1.167.23

## 1.167.51

### Patch Changes

- Updated dependencies [[`d6decca`](https://github.com/TanStack/router/commit/d6decca41807e9ca28279e2db6640e7a8bdc1229)]:
  - @tanstack/react-start-rsc@0.0.30

## 1.167.50

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.25
  - @tanstack/react-start-client@1.166.43
  - @tanstack/react-start-rsc@0.0.29
  - @tanstack/react-start-server@1.166.44
  - @tanstack/start-client-core@1.167.20
  - @tanstack/start-plugin-core@1.169.6
  - @tanstack/start-server-core@1.167.22

## 1.167.49

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.169.5
  - @tanstack/react-start-rsc@0.0.28

## 1.167.48

### Patch Changes

- Updated dependencies [[`8b97002`](https://github.com/TanStack/router/commit/8b97002af3f6d15204e60c55d3f5735b78bd7efe)]:
  - @tanstack/start-client-core@1.167.19
  - @tanstack/react-start-client@1.166.42
  - @tanstack/react-start-rsc@0.0.27
  - @tanstack/react-start-server@1.166.43
  - @tanstack/start-plugin-core@1.169.4
  - @tanstack/start-server-core@1.167.21

## 1.167.47

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.169.3
  - @tanstack/react-start-rsc@0.0.26

## 1.167.46

### Patch Changes

- Updated dependencies [[`4d864ee`](https://github.com/TanStack/router/commit/4d864eebbd184265eabb563d326ab409c93feb17)]:
  - @tanstack/react-router@1.168.24
  - @tanstack/start-plugin-core@1.169.2
  - @tanstack/start-server-core@1.167.20
  - @tanstack/react-start-client@1.166.41
  - @tanstack/react-start-rsc@0.0.25
  - @tanstack/react-start-server@1.166.42
  - @tanstack/start-client-core@1.167.18

## 1.167.45

### Patch Changes

- Updated dependencies [[`9252206`](https://github.com/TanStack/router/commit/9252206e5aeafe53e31eb7baa491d07a597c4dc6)]:
  - @tanstack/start-plugin-core@1.169.1
  - @tanstack/react-start-rsc@0.0.24

## 1.167.44

### Patch Changes

- Split Start plugin core bundler APIs into explicit Vite and Rsbuild subpaths so projects only need the bundler they use. Mark both `vite` and `@rsbuild/core` peers as optional where Start exposes both integrations. ([#7249](https://github.com/TanStack/router/pull/7249))

- Updated dependencies [[`dda463c`](https://github.com/TanStack/router/commit/dda463c8b571519165d3adbc337db7a0b8be1072)]:
  - @tanstack/start-plugin-core@1.169.0
  - @tanstack/react-start-rsc@0.0.23

## 1.167.43

### Patch Changes

- rsbuild ([#7228](https://github.com/TanStack/router/pull/7228))

- Updated dependencies [[`91a7089`](https://github.com/TanStack/router/commit/91a708989d00537a21911e74ff60bbfec8266295)]:
  - @tanstack/start-plugin-core@1.168.0
  - @tanstack/react-start-rsc@0.0.22
  - @tanstack/router-utils@1.161.7

## 1.167.42

### Patch Changes

- Updated dependencies [[`cd91cee`](https://github.com/TanStack/router/commit/cd91ceebb84b7b752b5ee09ac14e89ad2beb2259)]:
  - @tanstack/react-router@1.168.23
  - @tanstack/react-start-client@1.166.40
  - @tanstack/react-start-rsc@0.0.21
  - @tanstack/react-start-server@1.166.41

## 1.167.41

### Patch Changes

- Updated dependencies [[`f7f0025`](https://github.com/TanStack/router/commit/f7f00250f39cf0276a984558e5d427e9270d9635)]:
  - @tanstack/start-plugin-core@1.167.35
  - @tanstack/react-start-rsc@0.0.20

## 1.167.40

### Patch Changes

- Updated dependencies [[`e30814d`](https://github.com/TanStack/router/commit/e30814d949110ff25829de44d729ead47555940a)]:
  - @tanstack/react-router@1.168.22
  - @tanstack/react-start-client@1.166.39
  - @tanstack/react-start-rsc@0.0.19
  - @tanstack/react-start-server@1.166.40

## 1.167.39

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.21
  - @tanstack/react-start-client@1.166.38
  - @tanstack/react-start-rsc@0.0.18
  - @tanstack/react-start-server@1.166.39
  - @tanstack/start-client-core@1.167.17
  - @tanstack/start-plugin-core@1.167.34
  - @tanstack/start-server-core@1.167.19

## 1.167.38

### Patch Changes

- Updated dependencies [[`c5ad329`](https://github.com/TanStack/router/commit/c5ad32936f6adcca0c56474677b73b212498443b)]:
  - @tanstack/react-router@1.168.20
  - @tanstack/react-start-client@1.166.37
  - @tanstack/react-start-rsc@0.0.17
  - @tanstack/react-start-server@1.166.38

## 1.167.37

### Patch Changes

- Fix `@tanstack/react-start/server` imports inside React Server Components by adding a `react-server` export condition that resolves to the request/response APIs without pulling in the SSR renderer entrypoints. ([#7180](https://github.com/TanStack/router/pull/7180))

  This fixes RSC routes that call `createServerFn` loaders and read request headers in dev with `@vitejs/plugin-rsc` enabled.

## 1.167.36

### Patch Changes

- Updated dependencies [[`a581680`](https://github.com/TanStack/router/commit/a581680a27530469751b8ab419ada9ce66da4ffe)]:
  - @tanstack/start-plugin-core@1.167.33
  - @tanstack/react-start-rsc@0.0.16

## 1.167.35

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.167.32
  - @tanstack/react-start-rsc@0.0.15

## 1.167.34

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.167.31
  - @tanstack/react-start-rsc@0.0.14

## 1.167.33

### Patch Changes

- Updated dependencies [[`105d056`](https://github.com/TanStack/router/commit/105d05691a247779a63e7b688aa1207cce619339)]:
  - @tanstack/react-router@1.168.19
  - @tanstack/start-plugin-core@1.167.30
  - @tanstack/react-start-client@1.166.36
  - @tanstack/react-start-rsc@0.0.13
  - @tanstack/react-start-server@1.166.37

## 1.167.32

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.167.29
  - @tanstack/react-start-rsc@0.0.12

## 1.167.31

### Patch Changes

- Updated dependencies [[`0e2c900`](https://github.com/TanStack/router/commit/0e2c9003c18ae07c09969189c028f277ea562a7a)]:
  - @tanstack/start-server-core@1.167.18
  - @tanstack/react-start-rsc@0.0.11
  - @tanstack/react-start-server@1.166.36
  - @tanstack/start-plugin-core@1.167.28
  - @tanstack/react-router@1.168.18
  - @tanstack/react-start-client@1.166.35
  - @tanstack/start-client-core@1.167.16

## 1.167.30

### Patch Changes

- Updated dependencies [[`812792f`](https://github.com/TanStack/router/commit/812792fbda3caf97b300770855cf5641252f413b)]:
  - @tanstack/start-plugin-core@1.167.27
  - @tanstack/start-server-core@1.167.17
  - @tanstack/react-router@1.168.17
  - @tanstack/react-start-client@1.166.34
  - @tanstack/react-start-rsc@0.0.10
  - @tanstack/react-start-server@1.166.35
  - @tanstack/start-client-core@1.167.15

## 1.167.29

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.16
  - @tanstack/react-start-client@1.166.33
  - @tanstack/react-start-rsc@0.0.9
  - @tanstack/react-start-server@1.166.34
  - @tanstack/start-client-core@1.167.14
  - @tanstack/start-plugin-core@1.167.26
  - @tanstack/start-server-core@1.167.16

## 1.167.28

### Patch Changes

- Updated dependencies [[`d3f20fb`](https://github.com/TanStack/router/commit/d3f20fbe7acf69c3bd108c5ddc9748ad47690b04)]:
  - @tanstack/start-plugin-core@1.167.25
  - @tanstack/react-start-rsc@0.0.8

## 1.167.27

### Patch Changes

- Updated dependencies [[`6355bb7`](https://github.com/TanStack/router/commit/6355bb75f7637ba77f06a923c18fdaf37720bb48)]:
  - @tanstack/start-server-core@1.167.15
  - @tanstack/react-router@1.168.15
  - @tanstack/react-start-rsc@0.0.7
  - @tanstack/react-start-server@1.166.33
  - @tanstack/start-plugin-core@1.167.24
  - @tanstack/react-start-client@1.166.32
  - @tanstack/start-client-core@1.167.13

## 1.167.26

### Patch Changes

- migrate createStore > createAtom for simpler API ([#7150](https://github.com/TanStack/router/pull/7150))

- Updated dependencies [[`459057c`](https://github.com/TanStack/router/commit/459057cd2d90cff20d20e51d4964b0a8c950555e)]:
  - @tanstack/start-client-core@1.167.12
  - @tanstack/start-server-core@1.167.14
  - @tanstack/react-router@1.168.14
  - @tanstack/react-start-client@1.166.31
  - @tanstack/react-start-rsc@0.0.6
  - @tanstack/react-start-server@1.166.32
  - @tanstack/start-plugin-core@1.167.23

## 1.167.25

### Patch Changes

- fix publishing ([`f8ac427`](https://github.com/TanStack/router/commit/f8ac427000c3fec99225926e72f9f2fc7a37231f))

- Updated dependencies [[`f8ac427`](https://github.com/TanStack/router/commit/f8ac427000c3fec99225926e72f9f2fc7a37231f)]:
  - @tanstack/start-server-core@1.167.13
  - @tanstack/start-client-core@1.167.11
  - @tanstack/react-start-client@1.166.30
  - @tanstack/react-start-server@1.166.31
  - @tanstack/react-start-rsc@0.0.5
  - @tanstack/start-plugin-core@1.167.22

## 1.167.24

### Patch Changes

- fix publishing ([`2d53c05`](https://github.com/TanStack/router/commit/2d53c056ef0b203de8a28bc92c24e8e604205d52))

- Updated dependencies [[`2d53c05`](https://github.com/TanStack/router/commit/2d53c056ef0b203de8a28bc92c24e8e604205d52)]:
  - @tanstack/start-server-core@1.167.12
  - @tanstack/start-plugin-core@1.167.21
  - @tanstack/react-start-server@1.166.30
  - @tanstack/react-start-rsc@0.0.4

## 1.167.22

### Patch Changes

- Republish the React Start RSC package chain so fresh installs resolve a `start-plugin-core` build that exports the subpaths used by `react-start-rsc`. ([`3384abc`](https://github.com/TanStack/router/commit/3384abcffd98a68eb254b11221834bcbcdebec31))

- Updated dependencies [[`3384abc`](https://github.com/TanStack/router/commit/3384abcffd98a68eb254b11221834bcbcdebec31)]:
  - @tanstack/start-plugin-core@1.167.19
  - @tanstack/react-start-rsc@0.0.2

## 1.167.21

### Patch Changes

- Updated dependencies [[`f920527`](https://github.com/TanStack/router/commit/f920527e8d5a2124f0c8a1b2c9889c9d1bf29d90)]:
  - @tanstack/react-start-rsc@0.0.1

## 1.167.20

### Patch Changes

- Updated dependencies [[`540d221`](https://github.com/TanStack/router/commit/540d22100d33415a1ddc9eb193f6aeb8184da77f), [`70ec1da`](https://github.com/TanStack/router/commit/70ec1da1ed8aa252fae67716f69fe8520ecf91b0)]:
  - @tanstack/react-router@1.168.13
  - @tanstack/react-start-client@1.166.29
  - @tanstack/react-start-server@1.166.29

## 1.167.19

### Patch Changes

- Updated dependencies [[`b29d64d`](https://github.com/TanStack/router/commit/b29d64de0c400183114c12f82183f80e37d9ea5c)]:
  - @tanstack/react-router@1.168.12
  - @tanstack/react-start-client@1.166.28
  - @tanstack/react-start-server@1.166.28

## 1.167.18

### Patch Changes

- Updated dependencies [[`4b9ed6c`](https://github.com/TanStack/router/commit/4b9ed6c5cb5437df8607c605728c8338dd2eb02c)]:
  - @tanstack/react-router@1.168.11
  - @tanstack/react-start-client@1.166.27
  - @tanstack/react-start-server@1.166.27

## 1.167.17

### Patch Changes

- Updated dependencies [[`f7e9c5e`](https://github.com/TanStack/router/commit/f7e9c5e323793d1b28c96871819c265fd28ae397)]:
  - @tanstack/start-client-core@1.167.10
  - @tanstack/start-server-core@1.167.10
  - @tanstack/react-start-client@1.166.26
  - @tanstack/react-start-server@1.166.26
  - @tanstack/start-plugin-core@1.167.18

## 1.167.16

### Patch Changes

- Updated dependencies [[`796406d`](https://github.com/TanStack/router/commit/796406da66cfb12b518bb3ca326c9d541368fb06)]:
  - @tanstack/react-router@1.168.10
  - @tanstack/react-start-client@1.166.25
  - @tanstack/react-start-server@1.166.25
  - @tanstack/start-client-core@1.167.9
  - @tanstack/start-plugin-core@1.167.17
  - @tanstack/start-server-core@1.167.9

## 1.167.15

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.9
  - @tanstack/react-start-client@1.166.24
  - @tanstack/react-start-server@1.166.24
  - @tanstack/start-client-core@1.167.8
  - @tanstack/start-plugin-core@1.167.16
  - @tanstack/start-server-core@1.167.8

## 1.167.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.167.15

## 1.167.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.8
  - @tanstack/react-start-client@1.166.23
  - @tanstack/react-start-server@1.166.23
  - @tanstack/start-client-core@1.167.7
  - @tanstack/start-plugin-core@1.167.14
  - @tanstack/start-server-core@1.167.7

## 1.167.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.168.7
  - @tanstack/react-start-client@1.166.22
  - @tanstack/react-start-server@1.166.22
  - @tanstack/start-client-core@1.167.6
  - @tanstack/start-plugin-core@1.167.13
  - @tanstack/start-server-core@1.167.6

## 1.167.11

### Patch Changes

- Updated dependencies [[`5ca661c`](https://github.com/TanStack/router/commit/5ca661c2f8a7e50167b4112c64aa06cef4148ea9)]:
  - @tanstack/react-router@1.168.6
  - @tanstack/react-start-client@1.166.21
  - @tanstack/react-start-server@1.166.21

## 1.167.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.167.12

## 1.167.9

### Patch Changes

- Updated dependencies [[`cf5f554`](https://github.com/TanStack/router/commit/cf5f5542476137a81515099ad740747e84512f9a)]:
  - @tanstack/react-router@1.168.5
  - @tanstack/react-start-client@1.166.20
  - @tanstack/react-start-server@1.166.20
  - @tanstack/start-client-core@1.167.5
  - @tanstack/start-plugin-core@1.167.11
  - @tanstack/start-server-core@1.167.5

## 1.167.8

### Patch Changes

- Fix the `server-entry` package export types path so published packages include the expected declaration files, and add build-time package validation to catch similar export issues during CI. ([#7035](https://github.com/TanStack/router/pull/7035))

## 1.167.7

### Patch Changes

- Updated dependencies [[`71a8b68`](https://github.com/TanStack/router/commit/71a8b684c87c37fd4a033d99f5ba4a05c7a179f5)]:
  - @tanstack/react-router@1.168.4
  - @tanstack/react-start-client@1.166.19
  - @tanstack/react-start-server@1.166.19
  - @tanstack/start-client-core@1.167.4
  - @tanstack/start-plugin-core@1.167.10
  - @tanstack/start-server-core@1.167.4

## 1.167.6

### Patch Changes

- Updated dependencies [[`ed9c43d`](https://github.com/TanStack/router/commit/ed9c43df7ab8c679f6e6833d94651a0a091b9880)]:
  - @tanstack/start-plugin-core@1.167.9

## 1.167.5

### Patch Changes

- Updated dependencies [[`d81d21a`](https://github.com/TanStack/router/commit/d81d21ad05c9401bf54b24acd29401e1e4fd624c)]:
  - @tanstack/react-router@1.168.3
  - @tanstack/start-plugin-core@1.167.8
  - @tanstack/start-server-core@1.167.3
  - @tanstack/react-start-client@1.166.18
  - @tanstack/react-start-server@1.166.18
  - @tanstack/start-client-core@1.167.3

## 1.167.4

### Patch Changes

- Updated dependencies [[`6077120`](https://github.com/TanStack/router/commit/6077120efa59125ab79a6aff7cdb54ddae986d25)]:
  - @tanstack/start-plugin-core@1.167.7

## 1.167.3

### Patch Changes

- Updated dependencies [[`c9e1855`](https://github.com/TanStack/router/commit/c9e18555f3a5531e96de8f574cfca9edcdb18e5c)]:
  - @tanstack/react-start-client@1.166.17
  - @tanstack/start-client-core@1.167.2
  - @tanstack/start-server-core@1.167.2
  - @tanstack/react-router@1.168.2
  - @tanstack/react-start-server@1.166.17
  - @tanstack/start-plugin-core@1.167.6

## 1.167.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/start-plugin-core@1.167.5

## 1.167.1

### Patch Changes

- Updated dependencies [[`91cc628`](https://github.com/TanStack/router/commit/91cc62899b75ca920fe83c5ee7f3dbb5c71a523f)]:
  - @tanstack/react-router@1.168.1
  - @tanstack/react-start-client@1.166.16
  - @tanstack/react-start-server@1.166.16
  - @tanstack/start-client-core@1.167.1
  - @tanstack/start-plugin-core@1.167.4
  - @tanstack/start-server-core@1.167.1

## 1.167.0

### Minor Changes

- remove pendingMatches, cachedMatches ([#6704](https://github.com/TanStack/router/pull/6704))
  move to signal-based reactivity
  solid uses its own native signals

### Patch Changes

- Updated dependencies [[`0545239`](https://github.com/TanStack/router/commit/054523900b2ee19308e5a88417dadfc6923afe30)]:
  - @tanstack/start-client-core@1.167.0
  - @tanstack/start-server-core@1.167.0
  - @tanstack/react-router@1.168.0
  - @tanstack/react-start-client@1.166.15
  - @tanstack/react-start-server@1.166.15
  - @tanstack/start-plugin-core@1.167.3

## 1.166.18

### Patch Changes

- Updated dependencies [[`0f585d5`](https://github.com/TanStack/router/commit/0f585d5289c8a3b11697caa9b2aa3015d37d776e)]:
  - @tanstack/start-plugin-core@1.167.2

## 1.166.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.167.5
  - @tanstack/react-start-client@1.166.14
  - @tanstack/react-start-server@1.166.14
  - @tanstack/start-client-core@1.166.13
  - @tanstack/start-plugin-core@1.167.1
  - @tanstack/start-server-core@1.166.13

## 1.166.16

### Patch Changes

- Updated dependencies [[`6651473`](https://github.com/TanStack/router/commit/6651473d028a55c70f3f54af37a12b4379b46813)]:
  - @tanstack/start-plugin-core@1.167.0

## 1.166.15

### Patch Changes

- Add @tanstack/intent AI agent skills and CLI entry points for Router and Start packages ([#6866](https://github.com/TanStack/router/pull/6866))

- Updated dependencies [[`940151c`](https://github.com/TanStack/router/commit/940151cbed0c76c92a5cf196c0905b17a956ca7e), [`d637152`](https://github.com/TanStack/router/commit/d6371529b5ab09af7d81463a6c4082b092411967)]:
  - @tanstack/react-router@1.167.4
  - @tanstack/start-client-core@1.166.12
  - @tanstack/start-server-core@1.166.12
  - @tanstack/start-plugin-core@1.166.15
  - @tanstack/react-start-client@1.166.13
  - @tanstack/react-start-server@1.166.13

## 1.166.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/react-router@1.167.3
  - @tanstack/react-start-client@1.166.12
  - @tanstack/react-start-server@1.166.12
  - @tanstack/start-client-core@1.166.11
  - @tanstack/start-plugin-core@1.166.14
  - @tanstack/start-server-core@1.166.11

## 1.166.13

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

- Updated dependencies [[`838b0eb`](https://github.com/TanStack/router/commit/838b0eb9a8bbbb987a0a6972c1446e01423bbd7b)]:
  - @tanstack/react-router@1.167.2
  - @tanstack/react-start-client@1.166.11
  - @tanstack/react-start-server@1.166.11
  - @tanstack/router-utils@1.161.6
  - @tanstack/start-client-core@1.166.10
  - @tanstack/start-plugin-core@1.166.13
  - @tanstack/start-server-core@1.166.10

## 1.166.12

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))

- Updated dependencies [[`ef9b241`](https://github.com/TanStack/router/commit/ef9b241f3cfe95cee40daa96da669f0ffd4a971a)]:
  - @tanstack/react-start-client@1.166.10
  - @tanstack/react-start-server@1.166.10
  - @tanstack/start-client-core@1.166.9
  - @tanstack/start-plugin-core@1.166.12
  - @tanstack/start-server-core@1.166.9
  - @tanstack/react-router@1.167.1
  - @tanstack/router-utils@1.161.5

## 1.166.11

### Patch Changes

- fix: add `xmlns:xhtml` to generated sitemap ([#6920](https://github.com/TanStack/router/pull/6920))

- Updated dependencies [[`bfd6e62`](https://github.com/TanStack/router/commit/bfd6e62780f1cb96c210ae405723c5ebc22b10b0)]:
  - @tanstack/start-plugin-core@1.166.11

## 1.166.10

### Patch Changes

- Updated dependencies [[`6f297a2`](https://github.com/TanStack/router/commit/6f297a249424c0fd1c1a56aa4fc12c8217be7b6a)]:
  - @tanstack/react-router@1.167.0
  - @tanstack/react-start-client@1.166.9
  - @tanstack/react-start-server@1.166.9
  - @tanstack/start-client-core@1.166.8
  - @tanstack/start-plugin-core@1.166.10
  - @tanstack/start-server-core@1.166.8

## 1.166.9

### Patch Changes

- Updated dependencies [[`6069eba`](https://github.com/TanStack/router/commit/6069eba64369dbddb0d8dccdb4407f0e1a82259e)]:
  - @tanstack/react-router@1.166.8
  - @tanstack/start-plugin-core@1.166.9
  - @tanstack/react-start-client@1.166.8
  - @tanstack/react-start-server@1.166.8

## 1.166.8

### Patch Changes

- Updated dependencies [[`9a4d924`](https://github.com/TanStack/router/commit/9a4d924d2b60ffb0f7f3f8f11c95195222929870)]:
  - @tanstack/start-plugin-core@1.166.8
