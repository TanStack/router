---
'@tanstack/start-plugin-core': patch
---

Declare the `image` and `news` namespaces on the generated `sitemap.xml` `<urlset>`, so image and news entries are valid XML instead of being emitted with an undeclared prefix and `xmlns=""`.
