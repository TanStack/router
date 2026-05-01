import { createFileRoute } from '@tanstack/react-router'

/**
 * Simulates fetching page data from a remote API.
 */
function fetchPageData() {
  return new Promise<{
    title: string
    description: string
    ogTitle: string
    ogDescription: string
    canonicalUrl: string
    alternates: Array<{ lang: string; url: string }>
    breadcrumbs: Array<{ name: string; url: string }>
    analyticsId: string
  }>((resolve) => {
    setTimeout(() => {
      resolve({
        title: 'Deferred Page — Loaded Title',
        description:
          'This description was loaded asynchronously after 2 seconds.',
        ogTitle: 'OG: Deferred Page Loaded',
        ogDescription: 'Deferred OG description.',
        canonicalUrl: 'https://example.com/deferred',
        alternates: [
          { lang: 'es', url: 'https://example.com/es/deferred' },
          { lang: 'en', url: 'https://example.com/en/deferred' },
        ],
        breadcrumbs: [
          { name: 'Home', url: 'https://example.com/' },
          { name: 'Deferred', url: 'https://example.com/deferred' },
        ],
        analyticsId: 'GA-DEFERRED-123',
      })
    }, 2000)
  })
}

export const Route = createFileRoute('/deferred')({
  loader: () => {
    // Kick off the fetch in the loader — don't await it
    const dataPromise = fetchPageData()
    return { dataPromise }
  },
  head: ({ loaderData }) => ({
    meta: [
      // Pass a promise that resolves to meta descriptors.
      // Streamed for normal users, awaited for crawlers automatically.
      loaderData?.dataPromise.then((data) => [
        { title: data.title },
        { name: 'description', content: data.description },
        { property: 'og:title', content: data.ogTitle },
        { property: 'og:description', content: data.ogDescription },
        { property: 'og:type', content: 'website' },
      ]),
    ],
    links: [
      // Static link — always present immediately
      { rel: 'icon', href: '/favicon.ico' },
      // Deferred links — canonical and hreflang alternates
      loaderData?.dataPromise.then((data) => [
        { rel: 'canonical', href: data.canonicalUrl },
        ...data.alternates.map((alt) => ({
          rel: 'alternate',
          hrefLang: alt.lang,
          href: alt.url,
        })),
      ]),
    ],
    scripts: [
      // Deferred structured data (JSON-LD)
      loaderData?.dataPromise.then((data) => [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: data.title,
            description: data.description,
            url: data.canonicalUrl,
          }),
        },
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: data.breadcrumbs.map((crumb, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: crumb.name,
              item: crumb.url,
            })),
          }),
        },
      ]),
    ],
  }),
  // Body scripts are deferrable too: useful for analytics or third-party
  // tags that need an id from the loader (ex.: multitenant pages)
  // Streamed for users, awaited for crawlers — same semantics as head() entries.
  scripts: ({ loaderData }) => [
    loaderData?.dataPromise.then((data) => [
      {
        children: `console.log("analytics initialized:", "${data.analyticsId}")`,
      },
    ]),
  ],
  component: DeferredComponent,
})

function DeferredComponent() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Deferred Head (2s)</h1>
      <p className="mt-2">
        This page fetches data in the loader and structures head tags in{' '}
        <code>head()</code>. The page renders immediately — meta, links, and
        scripts are streamed to the client after ~2 seconds. Crawlers (Facebook,
        Twitter, etc.) get everything resolved in the initial HTML
        automatically.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        Demonstrates deferred <code>meta</code> tags, <code>link</code> tags
        (canonical, hreflang), <code>script</code> tags inside{' '}
        <code>head()</code> (JSON-LD structured data), and deferred body{' '}
        <code>scripts</code> (analytics) — all from a single async data source.
      </p>
    </div>
  )
}
