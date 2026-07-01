# Isomorphic getCookie/setCookie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export isomorphic `getCookie(name)` / `setCookie(name, value, options?)` from the root of `@tanstack/react-start`, `@tanstack/solid-start`, and `@tanstack/vue-start` (not `/server`), so the same call works on both client and server.

**Architecture:** A new `src/cookies.ts` file, identical in content, added to each of the three framework packages. Each uses `createIsomorphicFn` from `@tanstack/start-client-core`: the `.server()` branch delegates to the existing `getCookie`/`setCookie` in `@tanstack/start-server-core`; the `.client()` branch uses `cookie-es`'s `parse`/`serialize` against `document.cookie`. Implemented per-framework (not in the shared `start-client-core`) because `start-server-core` already depends on `start-client-core`, and the reverse would be a circular workspace dependency.

**Tech Stack:** TypeScript, `createIsomorphicFn` (`@tanstack/start-fn-stubs` via `@tanstack/start-client-core`), `cookie-es`, Vite (package build), publint/attw (package.json validation).

**Design doc:** `docs/superpowers/specs/2026-07-01-isomorphic-cookies-design.md`

---

### Task 1: Add `cookie-es` dependency to the three framework packages

**Files:**
- Modify: `packages/react-start/package.json:170`
- Modify: `packages/solid-start/package.json:126`
- Modify: `packages/vue-start/package.json:117`

- [ ] **Step 1: Add `cookie-es` to `packages/react-start/package.json`**

Current (lines 162-172):
```json
  "dependencies": {
    "@tanstack/react-router": "workspace:*",
    "@tanstack/react-start-client": "workspace:*",
    "@tanstack/react-start-rsc": "workspace:*",
    "@tanstack/react-start-server": "workspace:*",
    "@tanstack/router-utils": "workspace:*",
    "@tanstack/start-client-core": "workspace:*",
    "@tanstack/start-plugin-core": "workspace:*",
    "@tanstack/start-server-core": "workspace:*",
    "pathe": "^2.0.3"
  },
```

Change to:
```json
  "dependencies": {
    "@tanstack/react-router": "workspace:*",
    "@tanstack/react-start-client": "workspace:*",
    "@tanstack/react-start-rsc": "workspace:*",
    "@tanstack/react-start-server": "workspace:*",
    "@tanstack/router-utils": "workspace:*",
    "@tanstack/start-client-core": "workspace:*",
    "@tanstack/start-plugin-core": "workspace:*",
    "@tanstack/start-server-core": "workspace:*",
    "cookie-es": "^3.0.0",
    "pathe": "^2.0.3"
  },
```

- [ ] **Step 2: Add `cookie-es` to `packages/solid-start/package.json`**

Current (lines 120-128):
```json
  "dependencies": {
    "@tanstack/solid-router": "workspace:*",
    "@tanstack/solid-start-client": "workspace:*",
    "@tanstack/solid-start-server": "workspace:*",
    "@tanstack/start-client-core": "workspace:*",
    "@tanstack/start-plugin-core": "workspace:*",
    "@tanstack/start-server-core": "workspace:*",
    "pathe": "^2.0.3"
  },
```

Change to:
```json
  "dependencies": {
    "@tanstack/solid-router": "workspace:*",
    "@tanstack/solid-start-client": "workspace:*",
    "@tanstack/solid-start-server": "workspace:*",
    "@tanstack/start-client-core": "workspace:*",
    "@tanstack/start-plugin-core": "workspace:*",
    "@tanstack/start-server-core": "workspace:*",
    "cookie-es": "^3.0.0",
    "pathe": "^2.0.3"
  },
```

- [ ] **Step 3: Add `cookie-es` to `packages/vue-start/package.json`**

Current (lines 114-122):
```json
  "dependencies": {
    "@tanstack/start-client-core": "workspace:*",
    "@tanstack/start-plugin-core": "workspace:*",
    "@tanstack/start-server-core": "workspace:*",
    "@tanstack/vue-router": "workspace:*",
    "@tanstack/vue-start-client": "workspace:*",
    "@tanstack/vue-start-server": "workspace:*",
    "pathe": "^2.0.3"
  },
```

Change to:
```json
  "dependencies": {
    "@tanstack/start-client-core": "workspace:*",
    "@tanstack/start-plugin-core": "workspace:*",
    "@tanstack/start-server-core": "workspace:*",
    "@tanstack/vue-router": "workspace:*",
    "@tanstack/vue-start-client": "workspace:*",
    "@tanstack/vue-start-server": "workspace:*",
    "cookie-es": "^3.0.0",
    "pathe": "^2.0.3"
  },
```

- [ ] **Step 4: Install so the lockfile picks up the new dependency**

Run: `pnpm install`
Expected: exits 0; `pnpm-lock.yaml` is modified to add `cookie-es` under `react-start`, `solid-start`, and `vue-start`.

- [ ] **Step 5: Commit**

```bash
git add packages/react-start/package.json packages/solid-start/package.json packages/vue-start/package.json pnpm-lock.yaml
git commit -m "chore: add cookie-es dependency to react-start, solid-start, vue-start"
```

---

### Task 2: Isomorphic cookies for `react-start`

**Files:**
- Create: `packages/react-start/src/cookies.ts`
- Modify: `packages/react-start/src/index.ts:1`

- [ ] **Step 1: Create `packages/react-start/src/cookies.ts`**

```ts
import { createIsomorphicFn } from '@tanstack/start-client-core'
import {
  getCookie as getServerCookie,
  setCookie as setServerCookie,
} from '@tanstack/start-server-core'
import { parse, serialize } from 'cookie-es'
import type { CookieSerializeOptions } from 'cookie-es'

type GetCookieFn = (name: string) => string | undefined
type SetCookieFn = (
  name: string,
  value: string,
  options?: CookieSerializeOptions,
) => void

/**
 * Get a cookie value by name. Works on both the server (reads the current
 * request's `Cookie` header) and the client (reads `document.cookie`).
 * @param name Name of the cookie to get
 * @returns Value of the cookie, or `undefined` if not present
 * ```ts
 * const authorization = getCookie('Authorization')
 * ```
 */
export const getCookie: GetCookieFn = createIsomorphicFn()
  .server(getServerCookie)
  .client((name: string) => parse(document.cookie)[name]) as GetCookieFn

/**
 * Set a cookie value by name. Works on both the server (sets a `Set-Cookie`
 * header on the current response) and the client (writes `document.cookie`).
 * @param name Name of the cookie to set
 * @param value Value of the cookie to set
 * @param options Options for serializing the cookie
 * ```ts
 * setCookie('Authorization', '1234567')
 * ```
 */
export const setCookie: SetCookieFn = createIsomorphicFn()
  .server(setServerCookie)
  .client((name: string, value: string, options?: CookieSerializeOptions) => {
    document.cookie = serialize(name, value, options)
  }) as SetCookieFn
```

- [ ] **Step 2: Export from `packages/react-start/src/index.ts`**

Current (line 1):
```ts
export { useServerFn } from './useServerFn'
```

Change to:
```ts
export { useServerFn } from './useServerFn'
export { getCookie, setCookie } from './cookies'
```

- [ ] **Step 3: Build the package**

Run: `pnpm --filter @tanstack/react-start run build`
Expected: exits 0, both `vite build` steps succeed with no TypeScript errors, `dist/esm/index.d.ts` includes `getCookie`/`setCookie`.

- [ ] **Step 4: Verify package.json/type export validity**

Run: `pnpm --filter @tanstack/react-start run test:build`
Expected: exits 0 (`publint --strict` and `attw` report no errors).

- [ ] **Step 5: Commit**

```bash
git add packages/react-start/src/cookies.ts packages/react-start/src/index.ts
git commit -m "feat(react-start): add isomorphic getCookie/setCookie to root export"
```

---

### Task 3: Isomorphic cookies for `solid-start`

**Files:**
- Create: `packages/solid-start/src/cookies.ts`
- Modify: `packages/solid-start/src/index.ts:1`

- [ ] **Step 1: Create `packages/solid-start/src/cookies.ts`**

Identical to `packages/react-start/src/cookies.ts` from Task 2, Step 1 (same imports, same code — this package has the same dependencies available):

```ts
import { createIsomorphicFn } from '@tanstack/start-client-core'
import {
  getCookie as getServerCookie,
  setCookie as setServerCookie,
} from '@tanstack/start-server-core'
import { parse, serialize } from 'cookie-es'
import type { CookieSerializeOptions } from 'cookie-es'

type GetCookieFn = (name: string) => string | undefined
type SetCookieFn = (
  name: string,
  value: string,
  options?: CookieSerializeOptions,
) => void

/**
 * Get a cookie value by name. Works on both the server (reads the current
 * request's `Cookie` header) and the client (reads `document.cookie`).
 * @param name Name of the cookie to get
 * @returns Value of the cookie, or `undefined` if not present
 * ```ts
 * const authorization = getCookie('Authorization')
 * ```
 */
export const getCookie: GetCookieFn = createIsomorphicFn()
  .server(getServerCookie)
  .client((name: string) => parse(document.cookie)[name]) as GetCookieFn

/**
 * Set a cookie value by name. Works on both the server (sets a `Set-Cookie`
 * header on the current response) and the client (writes `document.cookie`).
 * @param name Name of the cookie to set
 * @param value Value of the cookie to set
 * @param options Options for serializing the cookie
 * ```ts
 * setCookie('Authorization', '1234567')
 * ```
 */
export const setCookie: SetCookieFn = createIsomorphicFn()
  .server(setServerCookie)
  .client((name: string, value: string, options?: CookieSerializeOptions) => {
    document.cookie = serialize(name, value, options)
  }) as SetCookieFn
```

- [ ] **Step 2: Export from `packages/solid-start/src/index.ts`**

Current (line 1):
```ts
export { useServerFn } from './useServerFn'
```

Change to:
```ts
export { useServerFn } from './useServerFn'
export { getCookie, setCookie } from './cookies'
```

- [ ] **Step 3: Build the package**

Run: `pnpm --filter @tanstack/solid-start run build`
Expected: exits 0, both `vite build` steps succeed with no TypeScript errors, `dist/esm/index.d.ts` includes `getCookie`/`setCookie`.

- [ ] **Step 4: Verify package.json/type export validity**

Run: `pnpm --filter @tanstack/solid-start run test:build`
Expected: exits 0 (`publint --strict` and `attw` report no errors).

- [ ] **Step 5: Commit**

```bash
git add packages/solid-start/src/cookies.ts packages/solid-start/src/index.ts
git commit -m "feat(solid-start): add isomorphic getCookie/setCookie to root export"
```

---

### Task 4: Isomorphic cookies for `vue-start`

**Files:**
- Create: `packages/vue-start/src/cookies.ts`
- Modify: `packages/vue-start/src/index.ts:1`

- [ ] **Step 1: Create `packages/vue-start/src/cookies.ts`**

Identical to `packages/react-start/src/cookies.ts` from Task 2, Step 1:

```ts
import { createIsomorphicFn } from '@tanstack/start-client-core'
import {
  getCookie as getServerCookie,
  setCookie as setServerCookie,
} from '@tanstack/start-server-core'
import { parse, serialize } from 'cookie-es'
import type { CookieSerializeOptions } from 'cookie-es'

type GetCookieFn = (name: string) => string | undefined
type SetCookieFn = (
  name: string,
  value: string,
  options?: CookieSerializeOptions,
) => void

/**
 * Get a cookie value by name. Works on both the server (reads the current
 * request's `Cookie` header) and the client (reads `document.cookie`).
 * @param name Name of the cookie to get
 * @returns Value of the cookie, or `undefined` if not present
 * ```ts
 * const authorization = getCookie('Authorization')
 * ```
 */
export const getCookie: GetCookieFn = createIsomorphicFn()
  .server(getServerCookie)
  .client((name: string) => parse(document.cookie)[name]) as GetCookieFn

/**
 * Set a cookie value by name. Works on both the server (sets a `Set-Cookie`
 * header on the current response) and the client (writes `document.cookie`).
 * @param name Name of the cookie to set
 * @param value Value of the cookie to set
 * @param options Options for serializing the cookie
 * ```ts
 * setCookie('Authorization', '1234567')
 * ```
 */
export const setCookie: SetCookieFn = createIsomorphicFn()
  .server(setServerCookie)
  .client((name: string, value: string, options?: CookieSerializeOptions) => {
    document.cookie = serialize(name, value, options)
  }) as SetCookieFn
```

- [ ] **Step 2: Export from `packages/vue-start/src/index.ts`**

Current (line 1):
```ts
export { useServerFn } from './useServerFn'
```

Change to:
```ts
export { useServerFn } from './useServerFn'
export { getCookie, setCookie } from './cookies'
```

- [ ] **Step 3: Build the package**

Run: `pnpm --filter @tanstack/vue-start run build`
Expected: exits 0, both `vite build` steps succeed with no TypeScript errors, `dist/esm/index.d.ts` includes `getCookie`/`setCookie`.

- [ ] **Step 4: Verify package.json/type export validity**

Run: `pnpm --filter @tanstack/vue-start run test:build`
Expected: exits 0 (`publint --strict` and `attw` report no errors).

- [ ] **Step 5: Commit**

```bash
git add packages/vue-start/src/cookies.ts packages/vue-start/src/index.ts
git commit -m "feat(vue-start): add isomorphic getCookie/setCookie to root export"
```

---

### Task 5: Manual smoke check in the `server-functions` e2e app

**Files:**
- Temporarily modify (revert after verifying): `e2e/react-start/server-functions/src/routes/cookies/set.tsx:1-3`

The existing fixture at `e2e/react-start/server-functions/src/routes/cookies/set.tsx` already sets cookies on the server (via `setCookie` from `@tanstack/react-start/server`) and reads them back on the client (via the `js-cookie` package, in `RouteComponent`'s `useEffect`). This step temporarily swaps that fixture to use the new isomorphic export end-to-end, to confirm the server-set cookie and a client-set cookie both round-trip correctly through the real dev server.

- [ ] **Step 1: Temporarily switch the fixture's import**

In `e2e/react-start/server-functions/src/routes/cookies/set.tsx`, change:

```ts
import { setCookie } from '@tanstack/react-start/server'
```

to:

```ts
import { getCookie, setCookie } from '@tanstack/react-start'
```

- [ ] **Step 2: Add a client-side call to the same `setCookie`/`getCookie` in `RouteComponent`**

Replace the `useEffect` body in `RouteComponent` (currently reads via `Cookies.get`) with a call that also exercises the isomorphic `setCookie`/`getCookie` from the client:

```tsx
useEffect(() => {
  setCookie(`cookie-5-${expectedCookieValue}`, expectedCookieValue)
  const tempCookies: Record<string, string | undefined> = {}
  for (let i = 1; i <= 4; i++) {
    const key = `cookie-${i}-${expectedCookieValue}`
    tempCookies[key] = Cookies.get(key)
  }
  tempCookies[`cookie-5-${expectedCookieValue}`] = getCookie(
    `cookie-5-${expectedCookieValue}`,
  )
  setCookiesFromDocument(tempCookies)
}, [])
```

- [ ] **Step 3: Run the dev server and check the route in a browser**

Run: `pnpm --filter tanstack-react-start-e2e-server-functions run dev`

Visit `/cookies/set?value=test123` in a browser. Expected: the results table shows `cookie-1-test123` through `cookie-4-test123` with value `test123` (server-set, `/server` `setCookie` — unchanged path, confirms no regression), and `cookie-5-test123` also shows `test123` (set via the new isomorphic client `setCookie` and read back via the new isomorphic client `getCookie`, both from `@tanstack/react-start` root — confirms the client branch works).

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 4: Revert the temporary fixture changes**

```bash
git checkout -- e2e/react-start/server-functions/src/routes/cookies/set.tsx
```

Expected: `git status` shows no changes in the e2e app (this task never commits anything — it's a manual verification-only step for this plan, not a permanent test addition).
