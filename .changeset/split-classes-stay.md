---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route splitting keeps every class, enum and namespace in the route module, as main does, whatever names it (by value or only in a type), and each chunk that reads one copies it. Its static blocks, static field initialisers, decorators, namespace body and the imports it reads run when the route module loads again, so a loader that reads their effect sees it on the first visit. Only code removed for the environment (`deleteNodes`, Start's server-only code on the client) takes one with it, also when it names it only in a type, so a server-only import it reads stays off the client. A chunk or provider copy again takes a declaration whose only other mention is itself or a type, with the state it fills. On the Start server, a declaration only a server function's handler reads is no longer evaluated a second time in a route's split chunk.
