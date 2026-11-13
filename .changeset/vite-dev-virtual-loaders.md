---
'@tanstack/start-plugin-core': patch
---

`vite dev`: the server environments read another plugin's virtual modules too, so a server function built on a factory a virtual module exports (`import { authed } from 'virtual:kit'`) is compiled when the server renders first; it was compiled as unknown code until the client happened to load the module, and its calls failed with an unknown function id.
