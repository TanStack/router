'use client'

import * as React from 'react'

import { reactUse, useHydrated } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { never as coreNever } from '@tanstack/start-client-core/hydration'
import {
  hydrateIdAttribute,
  hydrateWhenAttribute,
} from '@tanstack/start-client-core/hydration/constants'
import {
  getFallbackHtml,
  saveFallbackHtml,
} from '@tanstack/start-client-core/hydration/runtime'
import type {
  HydrateProps,
  InternalHydrateProps,
  ReactHydrationStrategy,
} from '../Hydrate'

const neverType = 'never'
const neverPromise = new Promise<void>(() => {})

function NeverGate(props: { children: React.ReactNode }) {
  if ((isServer as boolean | undefined) ?? typeof window === 'undefined') {
    return props.children as React.JSX.Element
  }

  if (reactUse) {
    reactUse(neverPromise)
    return props.children as React.JSX.Element
  }

  throw neverPromise
}

function HydrationFallback(props: { id: string; fallback: React.ReactNode }) {
  const html = getFallbackHtml(props.id)

  if (!html) return props.fallback as React.JSX.Element | null

  return (
    <div
      style={{ display: 'contents' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function NeverHydrate(props: HydrateProps): React.JSX.Element {
  const internalProps = props as InternalHydrateProps
  const hydrated = useHydrated()
  const reactId = React.useId()
  const id = internalProps.splitId
    ? `${internalProps.splitId}${reactId}`
    : reactId
  const shouldPreserveServerHTMLRef = React.useRef<boolean | undefined>(
    undefined,
  )
  shouldPreserveServerHTMLRef.current ??=
    ((isServer as boolean | undefined) ?? typeof window === 'undefined') ||
    !hydrated
  const markerRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return
      if (!shouldPreserveServerHTMLRef.current) {
        element.replaceChildren()
      } else {
        saveFallbackHtml(id, element)
      }
    },
    [id],
  )
  const markerProps = {
    ref: markerRef,
    [hydrateIdAttribute]: id,
    [hydrateWhenAttribute]: neverType,
  }

  return (
    <div {...markerProps}>
      <React.Suspense
        fallback={
          <HydrationFallback id={id} fallback={props.fallback ?? null} />
        }
      >
        <NeverGate>{props.children}</NeverGate>
      </React.Suspense>
    </div>
  )
}

/* @__NO_SIDE_EFFECTS__ */
export function never(): ReactHydrationStrategy {
  return /* @__PURE__ */ Object.assign(coreNever(), {
    $$renderHydrate: NeverHydrate,
  })
}
