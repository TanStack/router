---
'@tanstack/router-utils': patch
---

Dev servers no longer compile a module's importers as if it had no exports when an editor saves it in place (truncates the file, then writes it) and the file watcher reports the save while the file is still empty: the compiler reads the file again for a moment, as Vite does for its own hot updates. A file that still reads empty after that moment is an empty module (one emptied on purpose stops reporting the marker or exports it had). In a Start app, a server fn whose builder comes from another module could otherwise ship its handler's imports to the dev client.
