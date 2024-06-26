The code-splitting plugin is in `/packages/router-plugin/src/demo-rspack-code-splitter.ts`.
The unplugin factory is created into an rspack in `/examples/react/quickstart-rspack-file-based/src/rspack.ts#51`.

Testing requires the running of the monorepo's dev script and tot then check if it works in the rspack example.

- at the root, `pnpm dev`
- at `examples/react/quickstart-rspack-file-based`, `pnpm dev`
