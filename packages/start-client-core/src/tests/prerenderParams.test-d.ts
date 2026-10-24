import { expectTypeOf, test } from 'vitest'
import type {
  PrerenderParamsEntry,
  RoutePrerenderOptions,
  RouteSitemapOptions,
} from '../prerenderParams'
import type { AnyRoute, FileBaseRouteOptions } from '@tanstack/router-core'

type ParentRoute = Omit<AnyRoute, 'types'> & {
  types: Omit<AnyRoute['types'], 'allParams'> & {
    allParams: {
      orgId: string
    }
  }
}

test('sitemap metadata is available on entries and onSuccess pages', () => {
  const sitemap = {
    priority: 0,
    exclude: false,
    lastmod: new Date(),
    alternateRefs: [{ href: 'https://example.com/fr', hreflang: 'fr' }],
    images: [
      {
        loc: 'https://example.com/image.png',
        title: 'Image',
        caption: 'Caption',
      },
    ],
    news: {
      publication: { name: 'News', language: 'en' },
      publicationDate: new Date(),
      title: 'Title',
    },
  } satisfies RouteSitemapOptions
  const entry = {
    params: { slug: 'post' },
    sitemap,
  } satisfies PrerenderParamsEntry<{ slug: string }>
  expectTypeOf(entry.sitemap.lastmod).toEqualTypeOf<Date>()
  const options = {
    onSuccess: ({ page }) => {
      expectTypeOf(page.sitemap).toEqualTypeOf<
        RouteSitemapOptions | undefined
      >()
    },
  } satisfies RoutePrerenderOptions
  expectTypeOf(options.onSuccess).toBeFunction()

  const invalid = {
    // @ts-expect-error changefreq must be a sitemap frequency
    changefreq: 'sometimes',
  } satisfies RouteSitemapOptions
  expectTypeOf(invalid.changefreq).toEqualTypeOf<'sometimes'>()
})

test('prerenderParams uses route path and all params', () => {
  const options = {
    prerender: { retryCount: 2, failOnError: true, maxRedirects: 3 },
    prerenderParams: (ctx) => {
      expectTypeOf(ctx.routePath).toEqualTypeOf<'/posts/$slug'>()
      expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>()

      return [
        {
          params: {
            orgId: 'tanstack',
            slug: 'hello-world',
          },
        },
      ]
    },
    sitemap: {
      priority: 0.7,
      changefreq: 'weekly',
    },
  } satisfies FileBaseRouteOptions<
    unknown,
    ParentRoute,
    string,
    '/posts/$slug',
    undefined,
    { slug: string }
  >

  expectTypeOf(options.sitemap.changefreq).toEqualTypeOf<'weekly'>()

  type Entry = Awaited<
    ReturnType<NonNullable<typeof options.prerenderParams>>
  >[number]

  expectTypeOf<Entry['params']>().toEqualTypeOf<{
    orgId: string
    slug: string
  }>()
})

test('prerenderParams requires parent and route params', () => {
  const options = {
    // @ts-expect-error orgId is inherited from the parent route and required
    prerenderParams: () => [
      {
        params: {
          slug: 'hello-world',
        },
      },
    ],
  } satisfies FileBaseRouteOptions<
    unknown,
    ParentRoute,
    string,
    '/posts/$slug',
    undefined,
    { slug: string }
  >

  expectTypeOf(options).toEqualTypeOf<typeof options>()
})

test('prerenderParams supports multiple params, optional params, and splats', () => {
  const multipleParams = {
    prerenderParams: () => [
      {
        params: {
          category: 'guides',
          slug: 'routing',
        },
      },
    ],
  } satisfies FileBaseRouteOptions<
    unknown,
    AnyRoute,
    string,
    '/posts/$category/$slug',
    undefined,
    { category: string; slug: string }
  >

  type MultipleParamsEntry = Awaited<
    ReturnType<NonNullable<typeof multipleParams.prerenderParams>>
  >[number]

  expectTypeOf<MultipleParamsEntry['params']>().toEqualTypeOf<{
    category: string
    slug: string
  }>()
  expectTypeOf(multipleParams).toEqualTypeOf<typeof multipleParams>()

  const optionalParams = {
    prerenderParams: () => [
      {
        params: {},
      },
      {
        params: {
          category: 'guides',
        },
      },
    ],
  } satisfies FileBaseRouteOptions<
    unknown,
    AnyRoute,
    string,
    '/posts/{-$category}/{-$slug}',
    undefined,
    { category?: string; slug?: string }
  >

  type OptionalParamsEntry = Awaited<
    ReturnType<NonNullable<typeof optionalParams.prerenderParams>>
  >[number]

  expectTypeOf<OptionalParamsEntry['params']>().toMatchTypeOf<{
    category?: string
    slug?: string
  }>()
  expectTypeOf(optionalParams).toEqualTypeOf<typeof optionalParams>()

  const splatParams = {
    prerenderParams: () => [
      {
        params: {
          _splat: 'docs/routing',
        },
      },
    ],
  } satisfies FileBaseRouteOptions<
    unknown,
    AnyRoute,
    string,
    '/files/$',
    undefined,
    { _splat: string }
  >

  type SplatParamsEntry = Awaited<
    ReturnType<NonNullable<typeof splatParams.prerenderParams>>
  >[number]

  expectTypeOf<SplatParamsEntry['params']>().toEqualTypeOf<{
    _splat: string
  }>()
  expectTypeOf(splatParams).toEqualTypeOf<typeof splatParams>()
})

test('prerenderParams infers and requires search params', () => {
  type ParentSearchRoute = Omit<AnyRoute, 'types'> & {
    types: Omit<AnyRoute['types'], 'fullSearchSchemaInput'> & {
      fullSearchSchemaInput: {
        locale?: string
      }
    }
  }

  type SearchValidator = (input: { page: number; tag?: string }) => {
    page: number
    tag?: string
  }

  const options = {
    prerenderParams: () => [
      {
        params: {
          slug: 'hello-world',
        },
        search: {
          locale: 'en',
          page: 2,
          tag: 'router',
        },
      },
    ],
  } satisfies FileBaseRouteOptions<
    unknown,
    ParentSearchRoute,
    string,
    '/posts/$slug',
    SearchValidator,
    { slug: string }
  >

  type Entry = Awaited<
    ReturnType<NonNullable<typeof options.prerenderParams>>
  >[number]

  expectTypeOf<Entry['search']>().toMatchTypeOf<{
    locale?: string
    page: number
    tag?: string
  }>()
  expectTypeOf(options).toEqualTypeOf<typeof options>()

  const missingSearch = {
    // @ts-expect-error page is required by the route search schema
    prerenderParams: () => [
      {
        params: {
          slug: 'hello-world',
        },
      },
    ],
  } satisfies FileBaseRouteOptions<
    unknown,
    ParentSearchRoute,
    string,
    '/posts/$slug',
    SearchValidator,
    { slug: string }
  >

  expectTypeOf(missingSearch).toEqualTypeOf<typeof missingSearch>()
})

test('prerenderParams accepts sync and async generators', () => {
  const syncGenerator = {
    *prerenderParams(ctx) {
      expectTypeOf(ctx.routePath).toEqualTypeOf<'/posts/$slug'>()
      expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>()

      yield {
        params: {
          slug: 'hello-world',
        },
      }
    },
  } satisfies FileBaseRouteOptions<
    unknown,
    AnyRoute,
    string,
    '/posts/$slug',
    undefined,
    { slug: string }
  >

  const asyncGenerator = {
    async *prerenderParams() {
      yield {
        params: {
          slug: 'hello-world',
        },
      }
    },
  } satisfies FileBaseRouteOptions<
    unknown,
    AnyRoute,
    string,
    '/posts/$slug',
    undefined,
    { slug: string }
  >

  expectTypeOf(syncGenerator).toEqualTypeOf<typeof syncGenerator>()
  expectTypeOf(asyncGenerator).toEqualTypeOf<typeof asyncGenerator>()
})

test('prerenderParams accepts promised arrays and iterables', () => {
  type Options = FileBaseRouteOptions<
    unknown,
    AnyRoute,
    string,
    '/posts/$slug',
    undefined,
    { slug: string }
  >

  const promisedArray = {
    async prerenderParams(ctx) {
      expectTypeOf(ctx.routePath).toEqualTypeOf<'/posts/$slug'>()
      expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>()
      return [{ params: { slug: 'hello-world' } }]
    },
  } satisfies Options

  const promisedIterable = {
    async prerenderParams() {
      return (function* () {
        yield { params: { slug: 'hello-world' } }
      })()
    },
  } satisfies Options

  expectTypeOf<
    Awaited<ReturnType<typeof promisedArray.prerenderParams>>[number]['params']
  >().toEqualTypeOf<{ slug: string }>()
  expectTypeOf<
    Awaited<ReturnType<typeof promisedIterable.prerenderParams>>
  >().toMatchTypeOf<Iterable<{ params: { slug: string } }>>()

  const missingParams = {
    // @ts-expect-error async callbacks must also include the required slug
    prerenderParams: async () => [{ params: {} }],
  } satisfies Options
  expectTypeOf(missingParams).toEqualTypeOf<typeof missingParams>()
})
