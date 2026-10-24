---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': minor
'@tanstack/react-start-rsc': minor
'@tanstack/react-start': patch
'@tanstack/solid-start': patch
'@tanstack/vue-start': patch
---

Start's environment separation (server functions, middleware, isomorphic and env-only functions, `<ClientOnly>`) and the RSC CSS injection now run on the Yuku-based compiler core on Vite. Server functions are recognised by binding through re-exports, namespaces, aliases, user factories and stored builders; with SSR as the provider the handler stays in its module (one instance), only server functions the client references are HTTP-callable in production builds, default production ids are shorter, and nested server functions are hoisted on the server when safe. Compiler diagnostics report positions with every ECMAScript line terminator. In Vite dev, import protection now logs a denied import added by an edit of an existing module, and the violations of a module served before its importer finished transforming (or warmed up before it) once an importer reaches it.

Breaking for integrations: the experimental Babel-typed `compilerTransforms`, `serverFnProviderModuleDirectives`, `StartCompilerPlugin`, `StartCompilerImportTransform`, `StartCompilerTransformContext` and `StartCompilerTransformCandidate` options and types, and `@tanstack/react-start-rsc/plugin/rscCssTransform`, are removed. RSC integrations pass `rsc: { loadCssExpression, providerDirective }` instead.
