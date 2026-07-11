import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hydration-capped-assets/child')({
  loader: () => ({
    title: 'child loader data',
  }),
  head: ({ loaderData }) => ({
    meta: [
      {
        name: 'capped-assets-child-head',
        content: loaderData?.title ?? 'missing-loader-data',
      },
    ],
  }),
  scripts: ({ loaderData }) => [
    {
      children: `document.documentElement.setAttribute('data-capped-assets-child-script', ${JSON.stringify(loaderData?.title ?? 'missing-loader-data')})`,
    },
  ],
  component: () => (
    <div data-testid="capped-assets-child-component">Child route</div>
  ),
})
