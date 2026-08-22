import {
  Body,
  HeadContent,
  Html,
  Scripts,
  createRootRoute,
} from '@tanstack/vue-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack Vue Start Bun Bundler' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument(_: unknown, { slots }: { slots: { default?: () => any } }) {
  return (
    <Html lang="en">
      <head>
        <HeadContent />
      </head>
      <Body>
        {slots.default?.()}
        <Scripts />
      </Body>
    </Html>
  )
}
