import { createFileRoute } from '@tanstack/react-router'
import { RenderTemporalData, makeTemporalData } from '~/temporal'

export const Route = createFileRoute('/ssr/temporal')({
  loader: () => makeTemporalData(),
  component: () => {
    const loaderData = Route.useLoaderData()

    return <RenderTemporalData id="loader" data={loaderData} />
  },
})
