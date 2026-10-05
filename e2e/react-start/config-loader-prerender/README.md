# Native Vite config loader during prerendering

This project reproduces #7593. Its Vite config imports `#config-loader-source`, which resolves only when Node uses the `@repo/source` condition. The build starts Vite with `--configLoader native` and enables static prerendering. The preview server started by TanStack Start must reuse the same loader to read the config successfully.

Run `pnpm build` to exercise the regression, then `pnpm test:e2e` to check the prerendered page.
