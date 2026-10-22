---
'@tanstack/history': patch
---

Stamp history entries the browser creates on its own (such as a plain `<a href="#…">` fragment navigation) with a router index, so blocked Back/Forward/`go()` traversal across them is undone by its real distance instead of navigating to the wrong entry or reloading the page.
