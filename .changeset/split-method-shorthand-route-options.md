---
'@tanstack/router-plugin': patch
---

Added code-splitting support for the method shorthand syntax in route properties:

- route properties written using the method shorthand syntax such as `component() {}` or `async loader() {}` were previously ignored and could not be code split by the plugin
- fixed module-level bindings referenced from method properties not being detected by the plugin, leading to their value being instantiated twice, once in the route file and once in the split chunk
- fixed the `codeSplittingOptions.deleteNodes` plugin option not deleting route properties written using the method shorthand syntax, such as `ssr() {}`
