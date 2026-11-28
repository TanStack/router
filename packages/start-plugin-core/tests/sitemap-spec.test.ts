import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { create } from 'xmlbuilder2'
import { postBuild } from '../src/post-build'
import { parseStartConfig } from '../src/schema'

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const XMLNS_NS = 'http://www.w3.org/2000/xmlns/'

type Pages = NonNullable<Parameters<typeof parseStartConfig>[0]>['pages']

type XmlTree = {
  name: string
  attributes: Record<string, string>
  text: string
  children: Array<XmlTree>
}

// Google's examples are reproduced with these documented exceptions (see
// fixtures/google-sitemap-examples/README.md):
// - `omitLastmod`: TanStack Start always writes `<lastmod>`, so it is removed
//   from the generated tree when the example has none.
// - `onlyHost`: every `<loc>` is built from the single `sitemap.host`, so only
//   the example's `<url>` entries on that host are compared.
const examples: Array<{
  file: string
  sha256: string
  host: string
  pages: Pages
  omitLastmod?: true
  onlyHost?: string
}> = [
  {
    // https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
    file: 'sitemap.xml',
    sha256: '8eae6e3c57c98965611f8e717925d2cb9d04afb21455e6b4d4f3ffa847c21347',
    host: 'https://www.example.com',
    pages: [{ path: '/foo.html', sitemap: { lastmod: '2022-06-04' } }],
  },
  {
    // https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps
    file: 'image-sitemap.xml',
    sha256: '8b7772ee772dec834cfcf1f078edefcd0ff2ac6483d565139fcde8a1f580085f',
    host: 'https://example.com',
    pages: [
      {
        path: '/sample1.html',
        sitemap: {
          images: [
            { loc: 'https://example.com/image.jpg' },
            { loc: 'https://example.com/photo.jpg' },
          ],
        },
      },
      {
        path: '/sample2.html',
        sitemap: { images: [{ loc: 'https://example.com/picture.jpg' }] },
      },
    ],
    omitLastmod: true,
  },
  {
    // https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
    file: 'news-sitemap.xml',
    sha256: '89accef5f2838295d81c61e42350a29c5fe02d6e50f27432542c3980192be157',
    host: 'http://www.example.org',
    pages: [
      {
        path: '/business/article55.html',
        sitemap: {
          news: {
            publication: { name: 'The Example Times', language: 'en' },
            publicationDate: '2008-12-23',
            title: 'Companies A, B in Merger Talks',
          },
        },
      },
    ],
    omitLastmod: true,
  },
  {
    // https://developers.google.com/search/docs/specialty/international/localized-versions
    file: 'hreflang-sitemap.xml',
    sha256: '269e1aa57ad990c7454cb795d67e4d3f12360edd7492054951a36f9eb1f823ba',
    host: 'https://www.example.de',
    pages: ['/deutsch/page.html', '/schweiz-deutsch/page.html'].map(
      (pagePath) => ({
        path: pagePath,
        sitemap: {
          alternateRefs: [
            {
              hreflang: 'de',
              href: 'https://www.example.de/deutsch/page.html',
            },
            {
              hreflang: 'de-CH',
              href: 'https://www.example.de/schweiz-deutsch/page.html',
            },
            {
              hreflang: 'en',
              href: 'https://www.example.com/english/page.html',
            },
          ],
        },
      }),
    ),
    omitLastmod: true,
    onlyHost: 'https://www.example.de',
  },
]

// Parsing with xmlbuilder2 enforces Namespaces in XML, so an undeclared prefix
// fails here. Names are compared by namespace URI and local name, never prefix.
function parseXml(xml: string): XmlTree {
  // xmlbuilder2's DOM implements the standard DOM interfaces.
  return normalize(create(xml).root().node as unknown as Element)
}

function normalize(element: Element): XmlTree {
  const attributes: Record<string, string> = {}
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.namespaceURI !== XMLNS_NS) {
      attributes[`{${attribute.namespaceURI ?? ''}}${attribute.localName}`] =
        attribute.value
    }
  }
  const nodes = Array.from(element.childNodes)
  return {
    name: `{${element.namespaceURI ?? ''}}${element.localName}`,
    attributes,
    text: nodes
      .filter((node) => node.nodeType === node.TEXT_NODE)
      .map((node) => node.nodeValue)
      .join('')
      .trim(),
    children: nodes
      .filter((node): node is Element => node.nodeType === node.ELEMENT_NODE)
      .map(normalize),
  }
}

function locOf(url: XmlTree) {
  return url.children.find((child) => child.name === `{${SITEMAP_NS}}loc`)?.text
}

async function generateSitemap(host: string, pages: Pages) {
  const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-sitemap-spec-'))
  try {
    await postBuild({
      startConfig: parseStartConfig(
        { sitemap: { host }, pages },
        { framework: 'react' },
        process.cwd(),
      ),
      adapter: {
        getClientOutputDirectory: () => publicDir,
        prerender: () => Promise.resolve(),
      },
    })
    return await readFile(path.join(publicDir, 'sitemap.xml'), 'utf8')
  } finally {
    await rm(publicDir, { recursive: true, force: true })
  }
}

describe.each(examples)(
  'Google example $file',
  ({ file, sha256, host, pages, omitLastmod, onlyHost }) => {
    const fixture = readFileSync(
      new URL(`./fixtures/google-sitemap-examples/${file}`, import.meta.url),
      'utf8',
    )

    it('preserves the pinned upstream example', () => {
      expect(createHash('sha256').update(fixture).digest('hex')).toBe(sha256)
    })

    it('is reproduced by the generated sitemap', async () => {
      let expected = parseXml(fixture)
      if (onlyHost) {
        const urls = expected.children.filter((url) =>
          locOf(url)!.startsWith(`${onlyHost}/`),
        )
        expect(urls.length).toBeGreaterThan(0)
        expect(urls.length).toBeLessThan(expected.children.length)
        expected = { ...expected, children: urls }
      }

      let actual = parseXml(await generateSitemap(host, pages))
      if (omitLastmod) {
        actual = {
          ...actual,
          children: actual.children.map((url) => ({
            ...url,
            children: url.children.filter(
              (child) => child.name !== `{${SITEMAP_NS}}lastmod`,
            ),
          })),
        }
      }

      expect(actual).toEqual(expected)
    })
  },
)
