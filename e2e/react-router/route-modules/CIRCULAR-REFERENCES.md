# Circular route references reproduction

This fixture intentionally has a circular workspace dependency: Account links
to Products, and Products links back to Account. Both modules declare the
other in `uses` and as a package dependency. The application mounts both.

The declaration projects also use TypeScript composite project references in
both directions. Those references model a monorepo that builds each provider's
declarations before its consumers; they are an example configuration, not a
requirement of route modules.

From the repository root, these commands currently fail:

```sh
CI=1 NX_DAEMON=false pnpm nx run-many -p tanstack-router-e2e-react-route-modules -t test:unit:cycle --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run-many -p @route-modules/products -t check:references --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run-many -p @route-modules/products -t emit-types --skipRemoteCache
CI=1 NX_DAEMON=false pnpm nx run-many -p tanstack-router-e2e-react-route-modules -t test:e2e --skipRemoteCache
```

The clean-workspace tests fail in both generation orders because each module
requires the other's manifest. TypeScript reports a cyclic project-reference
graph, and Nx reports a cycle between `generate` and `emit-types` tasks. The
browser test describes the desired navigation, but cannot start while the
build graph is cyclic.
