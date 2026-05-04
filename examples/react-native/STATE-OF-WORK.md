# React Native + TanStack Router/Start — state of work

Living doc. Delete once the RN work is fully merged and shipped.

## Branch: `taren/rn-unified` (off `origin/main`)

The result of the rebase exercise: feat/react-native + the example
matrix work + the Phase 2 Start adapter all replayed onto a fresh main
base. Logically all the RN work is in one place now.

## Status

- ✅ Examples scaffold (bare, expo-go, expo-dev-client, _start-server)
- ✅ Phase 1 plugin (`@tanstack/router-plugin/metro` sync)
- ✅ Phase 2 plugins (`@tanstack/start-plugin-core/metro`,
  `@tanstack/react-start/plugin/metro`)
- ✅ Defensive gesture-handler probe
- ✅ Unit tests for Phase 1
- ✅ Maestro flow skeletons
- ✅ Docs + sidebar registration
- ❌ **`@tanstack/react-native-router` doesn't compile against main's
  router-core** — 10 TS errors, see below

## The blocker

The RN router was written against an earlier router-core API. Main has
since moved through:

- The signal-based core refactor (#6704)
- Removal of `pendingMatches` / `cachedMatches` from `RouterState`
- Moving `router.__store` → `router.stores.__store`
- Router constructor adding a required `getStoreConfig` parameter
- `getLocationChangeInfo` signature change

The errors at `pnpm --filter @tanstack/react-native-router build`:

```
src/Matches.tsx:447:5   Object literal may only specify known properties,
                        and 'pendingMatches' does not exist in type
                        'RouterState<...>'
src/Matches.tsx:447:27  Property 'pendingMatches' does not exist
src/Matches.tsx:447:48  Parameter 'match' implicitly has an 'any' type
src/Matches.tsx:448:26  Property 'cachedMatches' does not exist
src/Matches.tsx:448:45  Parameter 'match' implicitly has an 'any' type
src/Matches.tsx:495:38  Property 'pendingMatches' does not exist
src/Matches.tsx:497:45  Property 'pendingMatches' does not exist
src/router.ts:88:5      Expected 2 arguments, but got 1
                        (Router constructor needs getStoreConfig)
src/Transitioner.tsx:71:34  Argument of type 'RouterState<...>' is not
                            assignable to parameter of type
                            'ParsedLocation<{}>'
                            (getLocationChangeInfo signature changed)
src/useRouterState.tsx:51:26  Property '__store' does not exist on type
                              'TRouter' (use router.stores.__store)
```

## Migration work (remaining)

These are real engineering tasks, not mechanical drift:

1. **Matches.tsx pending-matches rendering** — the RN router renders the
   `pendingMatches` array during transitions (so the new screen shows
   while the old one is still active). With `pendingMatches` removed
   from `RouterState`, this logic needs redesigning against the new
   state model. Look at how main's react-router handles transitions for
   the pattern to copy.

2. **useRouterState.tsx** — change `router.__store` to
   `router.stores.__store`. Mechanical.

3. **router.ts** — supply `getStoreConfig` to the Router constructor.
   Look at react-router's `createRouter` for the pattern.

4. **Transitioner.tsx** — `getLocationChangeInfo` now takes a
   `ParsedLocation`, not a full `RouterState`. Update the call to pass
   `state.location` (or whatever property contains the parsed location).

5. **Implicit-any** — the cleanup of (1) will resolve the implicit `any`
   on `match` parameters automatically (they were inferred from the
   removed types).

## What's clean

The Phase 1 + Phase 2 Metro work is independent of these errors. Both
plugins build cleanly:

```bash
pnpm --filter @tanstack/router-plugin build       # green
pnpm --filter @tanstack/start-plugin-core build   # green
pnpm --filter @tanstack/react-start build         # green
```

The example scaffolds are also intact at the file level — they'll
compile once `@tanstack/react-native-router` does.

## Other branches (now redundant)

- `taren/mystifying-nash-aa11f2` — superseded by this branch. The work
  here was preserved via cherry-pick.
- `taren/start-metro` — superseded by this branch. The Phase 2 commits
  are now here.

Once `taren/rn-unified` merges, both source branches can be deleted.
