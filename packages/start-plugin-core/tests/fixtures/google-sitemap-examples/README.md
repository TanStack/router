# Google Search Central example sitemaps

Each XML file is a verbatim copy of an example sitemap code block from Google
Search Central, retrieved on 2026-10-12. The code blocks were extracted from the
pages' HTML and their HTML entities decoded; nothing else was changed:

| File                   | Source                                                                                                                           | Page last updated |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `sitemap.xml`          | [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) (XML sitemap)   | 2026-07-08        |
| `image-sitemap.xml`    | [Image sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)                            | 2025-12-10        |
| `news-sitemap.xml`     | [Create a News sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap)                       | 2025-12-10        |
| `hreflang-sitemap.xml` | [Localized versions of your pages](https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap) | 2026-09-21        |

The pages are not versioned, so the [test](../../sitemap-spec.test.ts) pins each
file's SHA-256 hash. It generates a sitemap from TanStack Start page options that
express the same content and compares both documents after parsing them with
Namespaces in XML. Elements and attributes are compared by namespace URI and
local name; prefixes, namespace declarations, comments, whitespace, and attribute
order are ignored.

The test documents two exceptions:

- TanStack Start always writes `<lastmod>`. For examples without `<lastmod>`
  (image, news, and hreflang), it is removed from the generated sitemap before
  comparing. The general example sets `lastmod` to match instead.
- Every generated `<loc>` uses the single `sitemap.host`. The hreflang example
  lists pages on two hosts, so the test compares only its two `<url>` entries
  on `https://www.example.de`, each with its full list of alternates. The
  `https://www.example.com` entry is not reproduced.

To update the fixtures, copy the example code blocks again from the pages above,
decode HTML entities, and keep the decoded text byte-for-byte. Update the hashes
in the test, the retrieval date, and the "last updated" dates here. If an
example uses something TanStack Start cannot express, document it rather than
editing the file. Preserve the [license](./LICENSE.md). Tests read only committed
files and make no network requests.
