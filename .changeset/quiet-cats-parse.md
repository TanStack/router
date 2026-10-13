---
'@tanstack/router-cli': patch
---

Replace `yargs` with the dependency-free `cac` for parsing `tsr` arguments. `tsr generate` and `tsr watch` work as before. Running `tsr` with no command now prints help, and unknown commands, unknown options, or extra arguments now print an error and exit with code 1 instead of being ignored.
