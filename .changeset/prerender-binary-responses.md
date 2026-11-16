---
'@tanstack/start-plugin-core': patch
---

Prerender: non-HTML responses are written as raw bytes instead of decoded text. The prerender pass read every response body with `res.text()`, which decodes as UTF-8 regardless of `content-type`, so a server route returning an image, font or archive had every invalid byte replaced with U+FFFD before being written to the output directory. A prerendered JPEG, for example, lost its `FF D8 FF E0` header and could not be opened, while the build still reported success. Responses whose `content-type` is HTML keep the existing text path, so link crawling and `prerender.onSuccess` behave as before.
