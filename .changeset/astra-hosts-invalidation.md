---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Compiler invalidation in dev servers and builds:

- Vite: a plugin's virtual module whose text differs per environment is read by each environment for itself. The second environment compiled against the first one's text: a production build could run the client's implementation on the server.
- Vite dev: modules that compiled against a plugin's virtual module compile again when the plugin regenerates it (the module is in the hot update, or its `load` watched the edited file). They kept the old text's decisions until a restart.
- Vite dev: deleting `foo.ts` while `foo/index.ts` exists (a file turned into a folder) compiles its importers against `foo/index.ts` at once. The client kept importing the deleted file.
- Saving a file nothing imports empty no longer holds up the hot update for about 100 ms.
