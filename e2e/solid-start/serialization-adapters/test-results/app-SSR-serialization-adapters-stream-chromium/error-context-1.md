# Test info

- Name: SSR serialization adapters >> stream
- Location: /Users/admin/repos/tanstack/router/e2e/solid-start/serialization-adapters/tests/app.spec.ts:65:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "Failed to load resource: net::ERR_INCOMPLETE_CHUNKED_ENCODING",
+ ]
    at Object.page (/Users/admin/repos/tanstack/router/e2e/e2e-utils/dist/esm/fixture.js:18:27)
```

# Page snapshot

```yaml
- heading "Serialization Adapters E2E Test" [level=1]
- link "Home":
  - /url: /
- separator
- separator
- heading "Stream" [level=3]
- text: hello world Loading...
```

# Test source

```ts
   1 | import { test as test$1, expect } from "@playwright/test";
   2 | const test = test$1.extend({
   3 |   whitelistErrors: [[], { option: true }],
   4 |   page: async ({ page, whitelistErrors }, use) => {
   5 |     const errorMessages = [];
   6 |     page.on("console", (m) => {
   7 |       if (m.type() === "error") {
   8 |         const text = m.text();
   9 |         for (const whitelistError of whitelistErrors) {
  10 |           if (typeof whitelistError === "string" && text.includes(whitelistError) || whitelistError instanceof RegExp && whitelistError.test(text)) {
  11 |             return;
  12 |           }
  13 |         }
  14 |         errorMessages.push(text);
  15 |       }
  16 |     });
  17 |     await use(page);
> 18 |     expect(errorMessages).toEqual([]);
     |                           ^ Error: expect(received).toEqual(expected) // deep equality
  19 |   }
  20 | });
  21 | export {
  22 |   test
  23 | };
  24 |
```