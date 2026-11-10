---
'@tanstack/router-plugin': patch
---

webpack and Rspack: the router plugin's route listener ends when the compiler shuts down (`compiler.close()`), not only when it stops watching. A one-shot build with the generator and code splitter as separate plugins no longer keeps its compiler state alive for the rest of the process.
