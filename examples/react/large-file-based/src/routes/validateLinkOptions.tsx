import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { Link, linkOptions } from '@tanstack/react-router'
import type {
  RegisteredRouter,
  ValidateLinkOptions,
} from '@tanstack/react-router'

export const Route = createFileRoute('/validateLinkOptions')({
  component: LinkPropsPage,
})
// From the docs: https://tanstack.com/router/latest/docs/framework/react/guide/type-utilities#type-checking-link-options-with-validatelinkoptions
export interface HeaderLinkProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions = unknown,
> {
  title: string
  linkOptions: ValidateLinkOptions<TRouter, TOptions>
  paramsToLink?: (id: string) => ValidateLinkOptions<TRouter, TOptions>
}

export function HeadingLink<TRouter extends RegisteredRouter, TOptions>(
  props: HeaderLinkProps<TRouter, TOptions>,
): React.ReactNode {
  return (
    <>
      <h1>{props.title}</h1>
      <Link {...props.linkOptions} />
    </>
  )
}

function LinkPropsPage() {
  const linkOptionsFromSomeOtherPlace = linkOptions({
    to: '/params/$fixedParam/$param1/$otherParam',
    params: {
      param1: 'value29',
      fixedParam: 'value',
    },
  })
  return (
    <>
      {/* direct use, works */}
      <HeadingLink
        title="Hello"
        linkOptions={{
          to: '/params/$fixedParam/$param1/$otherParam',
          params: {
            param1: 'value29',
            fixedParam: 'a',
            otherParam: 'value',
          },
        }}
      />
      {/* from a const from a linkOptions, works */}
      <HeadingLink title="Hello" linkOptions={linkOptionsFromSomeOtherPlace} />
      {/* from an inline linkOptions on a callback, breaks for some reason */}
      {/* and without the linkOptions in the callback, type error */}
      <HeadingLink
        title="Hello"
        linkOptions={{
          to: '/params/$fixedParam/$param1/$otherParam',
          params: {
            fixedParam: 'value',
            param1: 'value',
            otherParam: 'value',
          },
        }}
        paramsToLink={(id) =>
          linkOptions({
            to: '/params/$fixedParam/$param99/$otherParam',
            params: {
              param99: id,
              fixedParam: 'value',
              otherParam: 'value',
            },
          })
        }
      />
      {/* and without the linkOptions in the callback, type error */}
      <HeadingLink
        title="Hello"
        linkOptions={{
          to: '/params/$fixedParam/$param1/$otherParam',
          params: {
            fixedParam: 'value',
            param1: 'value',
            otherParam: 'value',
          },
        }}
        paramsToLink={(id) => ({
          to: '/params/$fixedParam/$param99/$otherParam',
          params: {
            param99: id,
            fixedParam: 'value',
            otherParam: 'value',
          },
        })}
      />
    </>
  )
}
