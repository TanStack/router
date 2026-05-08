export type BenchmarkSettings = {
  points: number
}

const benchmarkNumberFormat = new Intl.NumberFormat('en-US')

export function formatBenchmarkNumber(value: number) {
  return benchmarkNumberFormat.format(value)
}

export type BenchmarkVariant =
  | 'full'
  | 'defer-visible'
  | 'defer-visible-prefetch'
  | 'defer-runtime-only'
  | 'ssr-full'
  | 'ssr-defer-visible'
  | 'ssr-defer-visible-prefetch'
  | 'ssr-defer-runtime-only'
  | 'ssr-defer-interaction'

export const defaultBenchmarkSettings: BenchmarkSettings = {
  points: 1000,
}

function numberFromSearch(value: unknown, fallback: number) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function normalizeBenchmarkSearch(
  search: Record<string, unknown>,
): BenchmarkSettings {
  return {
    points: clampInteger(
      numberFromSearch(search.points, defaultBenchmarkSettings.points),
      50,
      5000,
    ),
  }
}

export const benchmarkRoutes = [
  {
    to: '/full',
    label: 'Full Hydration',
    variant: 'full',
    summary:
      'Baseline: chart JavaScript loads and the client-only chart mounts during startup.',
  },
  {
    to: '/defer-visible',
    label: 'Visible',
    variant: 'defer-visible',
    summary:
      'Split chart JavaScript and hydrate the boundary when the chart enters view.',
  },
  {
    to: '/defer-visible-prefetch',
    label: 'Visible + Idle Prefetch',
    variant: 'defer-visible-prefetch',
    summary:
      'Load the chart chunk during idle time, but wait for visibility to hydrate.',
  },
  {
    to: '/defer-runtime-only',
    label: 'Runtime Only',
    variant: 'defer-runtime-only',
    summary:
      'Keep chart JavaScript eager, but delay the client-only chart mount until visible.',
  },
  {
    to: '/ssr-full',
    label: 'SSR Table: Full',
    variant: 'ssr-full',
    summary:
      'Real server-rendered report table hydrates during startup with sorting, selection, expansion, visibility, density, and resizing.',
  },
  {
    to: '/ssr-defer-visible',
    label: 'SSR Table: Visible',
    variant: 'ssr-defer-visible',
    summary:
      'Real report table HTML is present immediately, while its interactive table runtime waits for visibility.',
  },
  {
    to: '/ssr-defer-visible-prefetch',
    label: 'SSR Table: Prefetch',
    variant: 'ssr-defer-visible-prefetch',
    summary:
      'The SSR table remains static until visible hydration, with idle prefetch allowed to load the table chunk earlier.',
  },
  {
    to: '/ssr-defer-runtime-only',
    label: 'SSR Table: Runtime Only',
    variant: 'ssr-defer-runtime-only',
    summary:
      'Table code stays eager, but hydration of the real SSR table is delayed until visible.',
  },
  {
    to: '/ssr-defer-interaction',
    label: 'SSR Table: Interaction',
    variant: 'ssr-defer-interaction',
    summary:
      'The real SSR table stays static until the first click intent asks for interactive table behavior.',
  },
] as const
