# E2E Fixture: TanStack Start Module Federation Host (Rsbuild)

This fixture validates host behavior for Rsbuild + Module Federation in:

- `ssr`
- `spa`
- `prerender`

It consumes the paired remote fixture at:

- `../module-federation-rsbuild-remote`

## Commands

```sh
# SSR only
pnpm test:e2e:ssr

# SPA only
pnpm test:e2e:spa

# Prerender only
pnpm test:e2e:prerender

# Full mode matrix
pnpm test:e2e
```

## Node SSR federation requirement

Server remotes are loaded over HTTP from the remote SSR output and use:

- `remoteType: 'script'` on the host SSR plugin config.

