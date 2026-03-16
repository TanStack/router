---
'@tanstack/router-cli': patch
---

Fix CLI commands not executing by passing process.argv.slice(2) to yargs
