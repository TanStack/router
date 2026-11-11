---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Rsbuild dev: each environment compiler forwards its own file events to the compiler's invalidation and builds the modules it found stale at `finishMake`, in the compilation of the event. A checkout that writes a module while the compilation of its dependency starts no longer leaves that module's importers compiled against its old text, and the importers of a created file or of a route whose id changed are built in one compilation instead of two. An add, or a removal of a file that is back, with the text the compiler read still asks again what looked for the file meanwhile; a save to a text without a plan (empty, unparsable, not the compiler's) keeps no plan of the old text. An edit that marks an imported module reports the import at its importer once, as before.
