---
'@tanstack/router-plugin': patch
---

Route options written as methods are code-split: `component() { … }`, `loader() { … }` and `async loader() { … }` split as `component: function () { … }` does (#8623). A function or method that uses its own `this` or `super` is not split: it stays in the route file as written, because splitting can change what `this` refers to, and the build warns at the option: use an arrow function or avoid `this` to split it (#8688).
