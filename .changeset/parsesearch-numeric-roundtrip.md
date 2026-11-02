---
'@tanstack/router-core': patch
---

fix(router-core): preserve string search params whose value is a valid JSON number but does not round-trip (e.g. `662E41`, large integers beyond safe range)

`parseSearchWith(JSON.parse)` called `JSON.parse` on every string query-param value and kept the result whenever it parsed successfully — including scientific-notation forms like `662E41` (= 6.62e43) and integers beyond `Number.MAX_SAFE_INTEGER`. Because `String(6.62e+43) !== '662E41'`, the original string was irreversibly destroyed before `validateSearch` could run.

The fix adds a numeric round-trip guard: if `JSON.parse` returns a `number` and `String(number) !== originalString`, the original string is kept instead.
