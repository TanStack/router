---
'@tanstack/start-plugin-core': patch
---

An env-only or isomorphic function called at once with a method as its implementation (`createClientOnlyFn(obj.method)()`, `createIsomorphicFn().client(obj.method)()`, an aliased factory) no longer calls the method with `obj` as `this`: the compiled call keeps it detached (`(0, obj.method)()`), as the function the factory returns calls it, and `eval` stays an indirect eval.
