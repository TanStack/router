---
title: Installation
---

You can install TanStack Router with any [NPM](https://npmjs.com) package manager.

```sh
npm install @tanstack/react-router
# or
pnpm add @tanstack/react-router
# or
yarn add @tanstack/react-router
# or
bun add @tanstack/react-router
# or
deno add npm:@tanstack/react-router
```

TanStack Router is currently only compatible with React (with ReactDOM) and Solid. If you would like to contribute to the React Native, Angular, or Vue adapter, please reach out to us on [Discord](https://tlinz.com/discord).

### Requirements

[//]: # 'Requirements'

- `react` either v18.x.x or v19.x.x
- `react-dom`, either v18.x.x or v19.x.x
  - Note that `ReactDOM.createRoot` is required.
  - The legacy `.render()` function is not supported.

[//]: # 'Requirements'

TypeScript is _optional_, but **HIGHLY** recommended! If you are using it, please ensure you are using `typescript>=v5.3.x`.

> [!IMPORTANT]
> We aim to support the last five minor versions of TypeScript. If you are using an older version, you may run into issues. Please upgrade to the latest version of TypeScript to ensure compatibility. We may drop support for older versions of TypeScript, outside of the range mentioned above, without warning in a minor or patch release.
