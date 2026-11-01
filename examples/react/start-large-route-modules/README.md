# TanStack Start - Large Route Modules Example

A TanStack Start application that installs many generated route modules, to
measure how builds and type checks scale with the number of modules.

- [Route modules guide](https://tanstack.com/start/latest/docs/framework/react/guide/route-modules)

## Layout

- `app/`: the application. It installs every module and provides the request
  context the modules require.
- `template/`: the module templates. `account` is a small module every feature
  module links to. `feature` is copied once per feature module. Its layout,
  item list, item and search routes load data through the module's own server
  functions and middleware, and `pages/page.tsx` is copied to fill up the route
  count.
- `modules/`: the generated module packages (not committed). They are linked
  like workspace packages and resolve their dependencies from this example.

## Getting Started

```sh
pnpm install
pnpm gen
pnpm dev
```

`pnpm gen` generates routes and builds each package's declarations with
`tsc -p tsconfig.route-types.json`, the account module first. The script cleans
each declaration output before compiling. Router handles route generation;
the package build handles declaration output, and a task runner such as Nx can
schedule these steps in dependency order. It also writes the application files that list the
modules: `app/package.json`, `app/route-modules.gen.ts` and
`app/src/moduleIndex.gen.tsx`. Options:

- `--modules <count>`: number of feature modules (default 50).
- `--routes <count>`: routes per feature module, at least 5 (default 10).
- `--transpiled`: ships the modules as JavaScript, the way a module prebuilt to
  transpiled ESM would. The application still code-splits and compiles them.

`pnpm dev` and `pnpm build` generate the default modules if none exist yet.
Run `pnpm gen` again to change their number.

Each feature declares its cross-module references in `tanstack.router.module.uses`.
The application selects each module's mount path explicitly in `includes[].at`.
The feature's viewer requirement is a type-only `StartModuleRequirements`
augmentation; the application supplies that context through request middleware.

## Build

```sh
pnpm build          # Vite
pnpm build:rsbuild  # Rsbuild
pnpm start
```

The Nx build targets are uncached because these commands preserve the selected
workload in ignored generated directories. Their output must be built for the
current workload instead of restored from a cache that omits those inputs.

## Measure

```sh
pnpm gen --modules 100
pnpm measure --runs 3 --profile
pnpm gen --modules 100 --transpiled
pnpm measure --runs 3 --profile
```

`pnpm measure` builds the application with Vite and with Rsbuild (one of them
with `--toolchain vite` or `--toolchain rsbuild`) and prints the median and
fastest build time. `--profile` adds one build under the V8 CPU profiler. It
lists where the JavaScript threads spent their time, by package. Time spent
inside a TanStack plugin, including the Babel passes it runs, counts for that
plugin. The results are saved to `measurements/` (not committed).

The example lists `@tanstack/router-core` and `@tanstack/start-client-core`
because it links the framework packages from this repository: the modules'
declarations name the types of a linked package's dependencies by their own
package name.
