import { isbot } from 'isbot'
import { isPromise } from '../utils'
import type { AnyRouter } from '../router'
import type { Awaitable } from '../utils'

export type SsrStreamingConfig = {
  render: boolean
  head?: boolean
}

export type ResolvedSsrStreaming = {
  render: boolean
  head: boolean
}

export type SsrStreamingOverride = {
  render?: boolean
  head?: boolean
}

export type SsrStreamingChannel = keyof ResolvedSsrStreaming

export type SsrStreamingResolverContext = {
  request: Request
  router: AnyRouter
}

export type SsrStreamingResolverResult = SsrStreamingConfig | undefined

export type SsrStreamingOption =
  | SsrStreamingConfig
  | ((
      ctx: SsrStreamingResolverContext,
    ) => Awaitable<SsrStreamingResolverResult>)

export function getDefaultSsrStreamingValue(request: Request): boolean {
  return !isbot(request.headers.get('user-agent'))
}

function createDefaultSsrStreaming(request: Request): ResolvedSsrStreaming {
  return {
    render: getDefaultSsrStreamingValue(request),
    head: false,
  }
}

function assertValidConfigKey(key: string) {
  if (key !== 'render' && key !== 'head') {
    throw new TypeError(
      `Unknown ssr.streaming option "${key}". Expected "render" or "head".`,
    )
  }
}

function normalizeStreamingBoolean(value: unknown, path: string): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  throw new TypeError(
    `Invalid ssr.streaming value for "${path}". Expected a boolean.`,
  )
}

export function shouldStreamSsrChannel(
  streaming: ResolvedSsrStreaming,
  channel: SsrStreamingChannel,
): boolean {
  if (channel === 'render') {
    return streaming.render
  }

  if (channel === 'head') {
    return streaming.head
  }

  throw new TypeError(
    `Unknown ssr.streaming channel "${channel}". Expected "render" or "head".`,
  )
}

function normalizeSsrStreaming(
  request: Request,
  raw: SsrStreamingResolverResult,
): ResolvedSsrStreaming {
  if (raw === undefined) {
    return createDefaultSsrStreaming(request)
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError(
      'Invalid ssr.streaming value. Expected an object, function result, or undefined.',
    )
  }

  for (const key of Object.keys(raw)) {
    assertValidConfigKey(key)
  }

  return {
    render: normalizeStreamingBoolean(raw.render, 'render'),
    head:
      raw.head === undefined
        ? false
        : normalizeStreamingBoolean(raw.head, 'head'),
  }
}

function applySsrStreamingOverride(
  streaming: ResolvedSsrStreaming,
  override: SsrStreamingOverride | undefined,
): ResolvedSsrStreaming {
  if (override === undefined) {
    return streaming
  }

  if (
    override === null ||
    typeof override !== 'object' ||
    Array.isArray(override)
  ) {
    throw new TypeError(
      'Invalid ssr.streaming override value. Expected an object or undefined.',
    )
  }

  for (const key of Object.keys(override)) {
    assertValidConfigKey(key)
  }

  return {
    render:
      override.render === undefined
        ? streaming.render
        : normalizeStreamingBoolean(override.render, 'render'),
    head:
      override.head === undefined
        ? streaming.head
        : normalizeStreamingBoolean(override.head, 'head'),
  }
}

export function resolveSsrStreaming(opts: {
  request: Request
  router: AnyRouter
  streaming?: SsrStreamingOption
  streamingOverride?: SsrStreamingOverride
}): ResolvedSsrStreaming | Promise<ResolvedSsrStreaming> {
  if (typeof opts.streaming !== 'function') {
    return applySsrStreamingOverride(
      normalizeSsrStreaming(opts.request, opts.streaming),
      opts.streamingOverride,
    )
  }

  const raw = opts.streaming({
    request: opts.request,
    router: opts.router,
  })

  return isPromise(raw)
    ? raw.then((value) =>
        applySsrStreamingOverride(
          normalizeSsrStreaming(opts.request, value),
          opts.streamingOverride,
        ),
      )
    : applySsrStreamingOverride(
        normalizeSsrStreaming(opts.request, raw),
        opts.streamingOverride,
      )
}
