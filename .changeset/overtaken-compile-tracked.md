---
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
'@tanstack/router-plugin': patch
---

Dev: a module whose compile was overtaken by changes of its dependencies three times in a row (the "compile-overtaken" warning, in a burst of file changes) is tracked again: a later change of what it read reloads it, instead of leaving its output stale until the module itself is saved.
