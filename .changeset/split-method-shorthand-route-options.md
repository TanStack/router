---
'@tanstack/router-plugin': patch
---

Added code-splitting support for the method shorthand syntax in route properties:

- route properties written using the method shorthand syntax such as `component() {}` or `async loader() {}` were previously ignored and could not be code split by the plugin
- fixed module-level bindings references in method properties not being detected by the plugin, leading to value instance duplication
