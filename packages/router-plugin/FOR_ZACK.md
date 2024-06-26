- `pnpm install` at the root

The code-splitting plugin is in `/packages/router-plugin/src/demo-rspack-code-splitter.ts`. This is a factory that returns the configuration unplugin expects before it creates a rspack specific output.

The rspack output created by unplugin is done here in `/examples/react/quickstart-rspack-file-based/src/rspack.ts#51`.

Testing requires the running of the monorepo's dev script and tot then check if it works in the rspack example.

- at the root, `pnpm dev`
- at `examples/react/quickstart-rspack-file-based`, `pnpm dev`
