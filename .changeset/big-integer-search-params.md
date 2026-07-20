---
'@tanstack/router-core': patch
---

fix: preserve integer search param literals beyond Number.MAX_SAFE_INTEGER as strings — JSON.parse silently rounds them (e.g. an 18-digit ad id `120247103250460643` becomes `120247103250460640`), corrupting the value on any redirect or link re-serialization
