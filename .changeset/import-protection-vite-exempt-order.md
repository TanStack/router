---
'@tanstack/start-plugin-core': patch
---

Import protection on Vite builds: a denied file that an exempt module imports plainly and an exempt pattern import (such as `import.meta.glob`) also reaches is now reported under `behavior` whichever way the build served it (it compiles the file once, for whichever import comes first), so the build's outcome no longer depends on the order. Rsbuild serves the file as it is to both, with no report.
