// Legacy Node-evaluation harness (module linker, Node rendering, hand-registered
// routes), kept only for the implementation tests of outside-compiler-corpus/
// (code-splitter-relocated-output, code-splitter-windows-ids).
// Acceptance tests use ../../route-app.ts (public plugin host, browser page).
/**
 * Compiles a route file through the code-splitter plugin the way a bundler
 * does and loads the modules it emits like an app (`loadRoute`,
 * `lazy-tracking.ts`, on the plugin host of `plugin-host.ts`).
 */
export { loadRoute } from './lazy-tracking'

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`
