import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/hydration-capped-assets/child')({
  loader: () => ({
    title: 'child loader data',
  }),
  head: ({ loaderData }) => ({
    meta: [
      {
        name: 'issue-7-child-head',
        content: loaderData?.title ?? 'missing-loader-data',
      },
    ],
  }),
  scripts: ({ loaderData }) => [
    {
      children: `window.__ISSUE_7_CHILD_SCRIPT = ${JSON.stringify(
        loaderData?.title ?? 'missing-loader-data',
      )}`,
    },
  ],
  component: () => (
    <div data-testid="issue-7-child-route-component">Child route</div>
  ),
})
