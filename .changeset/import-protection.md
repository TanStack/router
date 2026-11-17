---
'@tanstack/start-plugin-core': patch
---

Import protection:

- **Exempt importers get the real module.** A module that `exclude` or `ignoreImporters` exempts gets the real module of a denied file it imports plainly; it got the mock. An importer outside the scope (`include`, `srcDirectory`) still gets the mock, and a build now warns once about each denied file it mocks whose every importer is unchecked, naming the file, what denies it, its importers and the fix. The warning isn't a violation: `onViolation` isn't called and `'error'` doesn't fail the build.
- **Importers that disagree fail the build**, on Vite and Rsbuild, under both behaviors: one importer needs a denied file as it is (an exempt plain import, or one `allowImport` allows) while a checked module reaches the file itself (a pattern import such as `import.meta.glob`, or an import another plugin added). The error names the file, each importer and the two fixes: leave the file out of the pattern, or narrow the exemption or `allowImport`. Dev servers print it and keep serving.
- **Verdicts come after tree-shaking:** an import of a denied file that tree-shaking removes no longer fails the build, on Vite and Rsbuild.
- **Pattern imports:** on Rsbuild, a denied file reached through a template-literal `import()` or `import.meta.webpackContext` is reported (an `'error'` build fails), and the Vite dev server reports the pattern imports it mocks. Both mocked them silently.
- **Asset queries:** on Vite, `?raw` of a file with a `server-only` marker gives the client the mock; its text shipped.
- **Rsbuild:** a module that a worker plugin builds in a child compiler (`worker-rspack-loader`, workbox) is checked: a denied import there fails the build at the import, whatever the `behavior` (a child compiler can't load the mock), and is reported to `onViolation`; it was mocked silently.
- **Reports:** Vite builds report every violation, not only the first. Mock mode says "Import mocked". A pattern import's report names the pattern and its position and suggests a `!` exclusion. On Rsbuild, traces start at the app's own first file instead of Start's client entry. The suggested fix fits the import: `<ClientOnly>` for a component rendered on the server, `createClientOnlyFn` for a function. In production builds, a mocked value reports its use at runtime too.
