import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Client-side reconstruction from shipped data.
//
// Each lifecycle returns a mixed object with serializable fields (string,
// number, array) and non-serializable ones (Date, RegExp, Intl formatter,
// functions). `dehydrate` keeps only the wire-safe subset; `hydrate` rebuilds
// the full shape and uses its ctx for that: `params.locale` for the formatter,
// the parent `context` for the label functions.
//
// Server and client use different prefixes so tests can tell which side
// produced each value.

const getContextLabel = createIsomorphicFn()
  .server(() => 'server-ctx')
  .client(() => 'client-ctx')

const getBeforeLoadTag = createIsomorphicFn()
  .server(() => 'server-bl')
  .client(() => 'client-bl')

const getLoaderTitle = createIsomorphicFn()
  .server(() => 'server-ldr')
  .client(() => 'client-ldr')

function currencyFormatter(locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
}

export const Route = createFileRoute('/dehydrate-partial/$locale')({
  ssr: 'data-only',
  context: {
    handler: ({ params }) => {
      const label = getContextLabel()
      return {
        label,
        createdAt: new Date('2024-03-15T12:00:00.000Z'),
        currency: currencyFormatter(params.locale),
        format: (v: string) => `[${label}] ${v}`,
      }
    },
    dehydrate: ({ data }) => ({
      label: data.label,
      createdAtISO: data.createdAt.toISOString(),
    }),
    hydrate: ({ data, params, context }) => ({
      label: data.label,
      createdAt: new Date(data.createdAtISO),
      // rebuilt from the route params, not from the wire
      currency: currencyFormatter(params.locale),
      // uses the parent context (root's function-form context, re-run first)
      format: (v: string) => `[${data.label}|${context.rootContextCtx}] ${v}`,
    }),
  },

  beforeLoad: {
    handler: ({ context }) => {
      const tag = getBeforeLoadTag()
      return {
        tag,
        count: 42,
        pattern: /^hello-\d+$/i,
        describe: () => `${context.label}:${tag}`,
      }
    },
    dehydrate: ({ data }) => ({
      tag: data.tag,
      count: data.count,
      patternSource: data.pattern.source,
      patternFlags: data.pattern.flags,
    }),
    hydrate: ({ data, context }) => ({
      tag: data.tag,
      count: data.count,
      pattern: new RegExp(data.patternSource, data.patternFlags),
      // uses this route's own (already hydrated) context contribution
      describe: () => `${context.label}:${data.tag}:hydrated`,
    }),
  },

  loader: {
    handler: ({ context }) => {
      const scores = [10, 20, 30]
      return {
        title: getLoaderTitle(),
        scores,
        computeAvg: () => scores.reduce((a, b) => a + b, 0) / scores.length,
        summary: () => `${context.tag}/${scores.length}`,
      }
    },
    dehydrate: ({ data }) => ({
      title: data.title,
      scores: data.scores,
    }),
    hydrate: ({ data, context }) => ({
      title: data.title,
      scores: data.scores,
      computeAvg: () =>
        data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      // uses the beforeLoad contribution, visible in the loader ctx
      summary: () => `${context.tag}/${data.scores.length}:hydrated`,
    }),
  },

  component: DehydratePartialComponent,
})

function DehydratePartialComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  const contextDateOk = context.createdAt instanceof Date
  const contextFormatOk = typeof context.format === 'function'
  const contextCurrencyOk = context.currency instanceof Intl.NumberFormat
  const blPatternOk = context.pattern instanceof RegExp
  const loaderComputeOk = typeof loaderData.computeAvg === 'function'

  return (
    <div data-testid="dp-component">
      <h1 data-testid="dp-heading">Dehydrate Partial</h1>

      <div data-testid="dp-context-label">{context.label}</div>
      <div data-testid="dp-beforeLoad-tag">{context.tag}</div>
      <div data-testid="dp-loader-title">{loaderData.title}</div>
      <div data-testid="dp-beforeLoad-count">{String(context.count)}</div>

      <div data-testid="dp-context-date">
        {contextDateOk ? context.createdAt.toISOString() : 'NOT_DATE'}
      </div>
      <div data-testid="dp-context-date-type">
        {contextDateOk ? 'Date' : 'other'}
      </div>

      <div data-testid="dp-context-format">
        {contextFormatOk ? context.format('test') : 'NOT_FN'}
      </div>
      <div data-testid="dp-context-format-type">
        {contextFormatOk ? 'function' : 'other'}
      </div>

      <div data-testid="dp-context-currency">
        {contextCurrencyOk ? context.currency.format(1234.5) : 'NOT_FORMATTER'}
      </div>
      <div data-testid="dp-context-currency-locale">
        {contextCurrencyOk ? context.currency.resolvedOptions().locale : 'n/a'}
      </div>

      <div data-testid="dp-beforeLoad-pattern">
        {blPatternOk ? context.pattern.source : 'NOT_REGEXP'}
      </div>
      <div data-testid="dp-beforeLoad-pattern-type">
        {blPatternOk ? 'RegExp' : 'other'}
      </div>
      <div data-testid="dp-beforeLoad-pattern-test">
        {blPatternOk ? String(context.pattern.test('hello-123')) : 'N/A'}
      </div>
      <div data-testid="dp-beforeLoad-describe">{context.describe()}</div>

      <div data-testid="dp-loader-scores">{loaderData.scores.join(',')}</div>
      <div data-testid="dp-loader-avg">
        {loaderComputeOk ? String(loaderData.computeAvg()) : 'NOT_FN'}
      </div>
      <div data-testid="dp-loader-avg-type">
        {loaderComputeOk ? 'function' : 'other'}
      </div>
      <div data-testid="dp-loader-summary">{loaderData.summary()}</div>
    </div>
  )
}
