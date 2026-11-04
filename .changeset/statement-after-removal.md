---
'@tanstack/router-utils': patch
---

A declaration the compiler removes inside a function no longer merges the statements around it: with `let y = foo`, a removed `const local = 1;` and `(mk)()`, the output called `foo(mk)()`. The statement after a removal gets a `;` when its first token (`(`, `[`, a template, `+`, `-`, a regular expression) could continue the one before it.
