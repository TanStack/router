# @tanstack/history

## 1.162.2

### Patch Changes

- [#8264](https://github.com/TanStack/router/pull/8264) [`9035abc`](https://github.com/TanStack/router/commit/9035abc41163d83409ef582f7743a3c7be57dd93) - Respect `ignoreBlocker` during `go()` navigation, including document unload warnings. Preserve beforeunload warnings during back and forward navigation unless `ignoreBlocker` is requested, and clear the bypass after same-document traversal so later document navigation still warns about unsaved changes.

  Restore the original browser history entry when forward or multi-entry navigation is blocked.

## 1.162.1

### Patch Changes

- [#7985](https://github.com/TanStack/router/pull/7985) [`9cac62a`](https://github.com/TanStack/router/commit/9cac62a5c7f99ef070991ea6f1fa7e42c746d46b) - perf: compact private bundle boundaries- [#7975](https://github.com/TanStack/router/issues/7975)

## 1.162.0

### Minor Changes

- Clean minor bump, fresh start ([#7395](https://github.com/TanStack/router/pull/7395))

## 1.161.6

### Patch Changes

- build: update to vite-config 5.x (rolldown) ([#6926](https://github.com/TanStack/router/pull/6926))

## 1.161.5

### Patch Changes

- fix: build with @tanstack/vite-config 0.4.3 ([#6923](https://github.com/TanStack/router/pull/6923))
