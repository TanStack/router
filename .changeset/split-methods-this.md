---
'@tanstack/router-plugin': patch
---

Route options written as methods are code-split: `component() { … }`, `loader() { … }` and `async loader() { … }` split as `component: function () { … }` does (#8623). A function or method that uses its own `this` or `super` is not split: it stays in the route file, where the router calls it on the route options, and the build warns at the option, saying to write it as an arrow function or without `this` (#8688).
