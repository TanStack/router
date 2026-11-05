---
'@tanstack/router-utils': patch
---

Parse decorators placed after `export` (`export @dec class Store {}`). A route file with one is now read by the route generator and split, instead of logging a parse error, leaving the route tree unwritten and the route unsplit. Start's compilers, which share the parser, accept it too.
