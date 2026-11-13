---
'@tanstack/start-plugin-core': patch
---

Reading a server function or middleware builder's options by name (`base.options.method`, `const { method } = base.options`) no longer fails the client build; the options object passed on, written to, or its `middleware` list read still does, and now says to read options by name. Refusals give a fix that works for more shapes: a middleware kept in an object is told to stay in its own `const` and get its `.server()` there; an `.mdx` (or other non-JavaScript) module re-exporting a builder is told to import it from its own module, at the re-export's position also when the loader makes no source map; a factory returned from a getter or method is named. A Vue SFC statement that a later transform reprints over several lines is reported at its line and column in the SFC.
