# Running an e2e project as an installed project

`scripts/e2e/run-as-installed.mjs` runs a command in a copy of an e2e project
whose `@tanstack/*` dependencies are installed the way a user's package
manager installs them.

## Why

An e2e project in this repository depends on `@tanstack/*` with the
`workspace:` protocol. pnpm installs such a dependency as a link to the
package's directory:

```
e2e/react-start/vitest-library/node_modules/@tanstack/react-start
  -> packages/react-start
```

In a user's project the same package is a directory inside `node_modules`:

```
node_modules/.pnpm/@tanstack+react-start@1.x/node_modules/@tanstack/react-start
```

Vite and Vitest look at the real path of a file to decide how to treat it, and
the two layouts get different answers:

| Question                                                | Linked (`packages/react-start/...`)                             | Installed (`node_modules/...`)                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Does Vitest run the file through Vite's plugins?        | Always. It is source code to Vitest.                            | Only when a pattern of `server.deps.inline` matches. Otherwise Node loads it as it is. |
| Does Vite pre-bundle what the file imports?             | Yes, when the import is first seen.                             | Only what `optimizeDeps.include` names. Any other import is served as it is.           |
| Can the project import a package it does not depend on? | The repository root's dependencies, from the directories above. | No. pnpm gives a project only its own dependencies.                                    |

So a run inside the repository cannot show a mistake in what our plugins tell
Vite or Vitest about dependencies: `resolve.noExternal`, `resolve.external`,
`optimizeDeps` and the inline list of a test runner. Every `@tanstack/*` file
goes through the Start compiler there, whatever the plugin says.

Two bugs were found this way in November 2026, in projects whose tests passed
in the repository:

- A package that depends on `@tanstack/react-start` but not on
  `@tanstack/react-router` failed in Vitest's browser mode. Start asked Vite to
  pre-bundle `@tanstack/react-store` by a path through the router, which did
  not resolve from the project, and the browser got the store's CommonJS
  dependency as it is.
- In a jsdom test, Node loaded `@tanstack/start-client-core` as it is, without
  the Start compiler. Its functions with a client and a server implementation
  then ran the server one. Vitest's translation of the wildcards in Start's
  `resolve.noExternal` did not match a package name with a dash. Vitest 5.1.1
  fixed that (vitest-dev/vitest#11978), and Start's test runs need that
  version or a later one.

## What the script does

1. It runs `pnpm --filter <project> deploy <directory>`, with a new directory
   under the system's temporary directory. `pnpm deploy` copies the project and
   installs its dependencies into the copy from the workspace's lockfile, so
   the versions are the ones the repository uses. A workspace package is
   packed as for publishing (the files its `files` field names) and installed
   like a package from the registry.
2. It runs the given command in the copy, with the copy's `node_modules/.bin`
   first on `PATH`.
3. It removes the copy and exits with the command's status.

The copy is outside the repository on purpose. From a directory inside it,
Node and Vite would walk up to the repository's own `node_modules` and
workspace root.

## Using it

In the e2e project's `package.json`:

```json
{
  "scripts": {
    "test:e2e": "pnpm run test:e2e:installed",
    "test:e2e:installed": "node ../../../scripts/e2e/run-as-installed.mjs vitest run"
  },
  "nx": {
    "targets": {
      "test:e2e": {
        "inputs": [
          "buildProduction",
          "^production",
          "dependentTaskOutputs",
          "{workspaceRoot}/scripts/e2e/run-as-installed.mjs"
        ]
      }
    }
  }
}
```

The `inputs` add the script to what Nx hashes for the target.

The command can be a script of the project, which `pnpm run` starts in the
copy. `e2e/react-start/vitest-library` and `e2e/react-start/vitest-app` run
Vitest twice that way. The copy starts with an empty Vitest module cache, so
the second run gets the compiled modules of the first from the cache:

```json
{
  "scripts": {
    "test:e2e:installed": "node ../../../scripts/e2e/run-as-installed.mjs pnpm run test:e2e:cold-then-cached",
    "test:e2e:cold-then-cached": "vitest run && vitest run"
  }
}
```

These two projects run their tests only in the copy. `vitest run` in the
directory of `vitest-app` fails one browser test file on the first run after
an install and passes on the second. Start's packages are links there, so Vite
sees what they import (`seroval`, `cookie-es`) only when a test loads them. It
pre-bundles those packages then and reloads the page, and the test file that
was loading fails to import. Vite keeps the pre-bundle for later runs. In the
copy Vite pre-bundles nothing late (the table above), so the page is not
reloaded.

To look at a copy after a failure:

```sh
node ../../../scripts/e2e/run-as-installed.mjs --keep vitest run
```

## In CI

`pnpm test:pr` runs `test:e2e` of every affected project, and `test:ci` runs
it for all of them, so the run as a user's project is part of every CI run that
touches these projects. Before it runs the command, the script checks that
each `@tanstack/*` dependency of the project resolves to a package inside the
copy, and fails otherwise. A pass therefore means the tests ran against
installed packages, and not against links that slipped back in.

## When a project needs it

When what it tests depends on how a bundler or a test runner treats a package
in `node_modules`: whether the package goes through our compiler, whether its
dependencies are pre-bundled, and whether a package resolves from the project.
`e2e/react-start/vitest-library` and `e2e/react-start/vitest-app` use it.

The client code of a production build does not differ between the layouts: a
build bundles every file, wherever it is. Server code can differ in the same
way as a test run, because Vite leaves a package in `node_modules` to Node
unless `resolve.noExternal` matches it. So a Playwright project can use the
script as well; none does yet.

## Limits

- The packages have to be built first: the copy gets each package's published
  files. The `test:e2e` target depends on `^build`.
- It is pnpm's layout. npm and Yarn put more packages where a project can
  import them, so pnpm is the stricter case for resolution, but their layouts
  are not run.
- `pnpm deploy` needs the registry: it checks the lockfile against the
  workspace's supply-chain policies, and it downloads what the store lacks.
- It takes about 7 seconds before the command starts.
