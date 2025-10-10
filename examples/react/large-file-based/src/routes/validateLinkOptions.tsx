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
  return (
    <HeadingLink
      title="Hello"
      linkOptions={linkOptions({
        to: '/params/$param29',
        params: {
          param29: 'value29',
        },
      })}
    />
  )
}
