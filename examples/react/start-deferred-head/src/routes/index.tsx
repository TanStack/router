import { createFileRoute } from '@tanstack/react-router'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      ...seo({
        title: 'Home — Sync Head',
        description: 'This page has synchronous head meta tags.',
      }),
    ],
  }),
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Home</h1>
      <p className="mt-2">
        This page uses synchronous head. The title is set immediately during
        SSR. Check the page source to see "Home — Sync Head" in the HTML.
      </p>
    </div>
  )
}
