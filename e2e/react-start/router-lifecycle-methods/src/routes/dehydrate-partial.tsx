import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// ---------------------------------------------------------------------------
// Partial hydration test
//
// Each lifecycle returns a mixed object containing:
//   - serializable fields (string, number)
//   - non-serializable fields (Date, function, RegExp)
//
// `dehydrate` strips the non-serializable parts, keeping only the wire-safe
// subset. `hydrate` reconstructs the full shape — re-creating non-serializable
// values from the serializable data that was transmitted.
//
// Server vs client use different string prefixes so the test can tell which
// environment produced each value.
// ---------------------------------------------------------------------------

// -- Isomorphic fns ---------------------------------------------------------

const getContextLabel = createIsomorphicFn()
  .server(() => 'server-ctx')
  .client(() => 'client-ctx')

const getBeforeLoadTag = createIsomorphicFn()
  .server(() => 'server-bl')
  .client(() => 'client-bl')

const getLoaderTitle = createIsomorphicFn()
  .server(() => 'server-ldr')
  .client(() => 'client-ldr')

// -- Route ------------------------------------------------------------------

export const Route = createFileRoute('/dehydrate-partial')({
  ssr: 'data-only',
  context: {
    handler: () => {
      const label = getContextLabel()
      return {
        label,
        createdAt: new Date('2024-03-15T12:00:00.000Z'),
        format: (v: string) => `[${label}] ${v}`,
      }
    },
    dehydrate: (value) => ({
      label: value.label,
      createdAtISO: value.createdAt.toISOString(),
    }),
    hydrate: (wire) => ({
      label: wire.label,
      createdAt: new Date(wire.createdAtISO),
      format: (v: string) => `[${wire.label}] ${v}`,
    }),
  },

  beforeLoad: {
    handler: () => ({
      tag: getBeforeLoadTag(),
      count: 42,
      pattern: /^hello-\d+$/i,
    }),
    dehydrate: (value) => ({
      tag: value.tag,
      count: value.count,
      patternSource: value.pattern.source,
      patternFlags: value.pattern.flags,
    }),
    hydrate: (wire) => ({
      tag: wire.tag,
      count: wire.count,
      pattern: new RegExp(wire.patternSource, wire.patternFlags),
    }),
  },

  loader: {
    handler: () => {
      const scores = [10, 20, 30]
      return {
        title: getLoaderTitle(),
        scores,
        computeAvg: () => scores.reduce((a, b) => a + b, 0) / scores.length,
      }
    },
    dehydrate: (value) => ({
      title: value.title,
      scores: value.scores,
    }),
    hydrate: (wire) => ({
      title: wire.title,
      scores: wire.scores,
      computeAvg: () =>
        wire.scores.reduce((a, b) => a + b, 0) / wire.scores.length,
    }),
  },

  component: DehydratePartialComponent,
})

function DehydratePartialComponent() {
  const context = Route.useRouteContext()
  const loaderData = Route.useLoaderData()

  // Verify non-serializable parts were reconstructed correctly
  const contextDateOk = context.createdAt instanceof Date
  const contextFormatOk = typeof context.format === 'function'
  const blPatternOk = context.pattern instanceof RegExp
  const loaderComputeOk = typeof loaderData.computeAvg === 'function'

  return (
    <div data-testid="dp-component">
      <h1 data-testid="dp-heading">Dehydrate Partial</h1>

      {/* Serializable fields — verify server vs client origin */}
      <div data-testid="dp-context-label">{context.label}</div>
      <div data-testid="dp-beforeLoad-tag">{context.tag}</div>
      <div data-testid="dp-loader-title">{loaderData.title}</div>

      {/* Serializable field (number) */}
      <div data-testid="dp-beforeLoad-count">{String(context.count)}</div>

      {/* Non-serializable: Date — show ISO + type check */}
      <div data-testid="dp-context-date">
        {contextDateOk ? context.createdAt.toISOString() : 'NOT_DATE'}
      </div>
      <div data-testid="dp-context-date-type">
        {contextDateOk ? 'Date' : 'other'}
      </div>

      {/* Non-serializable: function — call it and show result */}
      <div data-testid="dp-context-format">
        {contextFormatOk ? context.format('test') : 'NOT_FN'}
      </div>
      <div data-testid="dp-context-format-type">
        {contextFormatOk ? 'function' : 'other'}
      </div>

      {/* Non-serializable: RegExp — show source + test it */}
      <div data-testid="dp-beforeLoad-pattern">
        {blPatternOk ? context.pattern.source : 'NOT_REGEXP'}
      </div>
      <div data-testid="dp-beforeLoad-pattern-type">
        {blPatternOk ? 'RegExp' : 'other'}
      </div>
      <div data-testid="dp-beforeLoad-pattern-test">
        {blPatternOk ? String(context.pattern.test('hello-123')) : 'N/A'}
      </div>

      {/* Non-serializable: function (computeAvg) — call and show */}
      <div data-testid="dp-loader-scores">{loaderData.scores.join(',')}</div>
      <div data-testid="dp-loader-avg">
        {loaderComputeOk ? String(loaderData.computeAvg()) : 'NOT_FN'}
      </div>
      <div data-testid="dp-loader-avg-type">
        {loaderComputeOk ? 'function' : 'other'}
      </div>
    </div>
  )
}
