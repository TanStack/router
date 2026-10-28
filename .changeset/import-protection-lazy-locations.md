---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Faster Start builds: import protection locates an import through the bundler's source map only when it reports a violation (every checked module used to combine its input map), a dependency module an app imports is read but no longer parsed and summarised unless its text names something the compiler recognises or re-exports another module, and the compiler asks less of the parser per module. A violation's trace still locates each step in the user's files; a step through a module another plugin rewrote (React Compiler, MDX) is named without a line.
