---
'@tanstack/start-client-core': patch
---

Type-check `createStart(() => ({ extends: startModules }))` for applications that install the Start fragments of many route modules. With about 50 fragments, TypeScript reported "Type instantiation is excessively deep and possibly infinite".
