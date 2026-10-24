import { createFileRoute } from '@tanstack/react-router'
import { RawStream } from '@tanstack/react-start'
import {
  createRawStreamSource,
  rawStreamPeakMarker,
} from '../../../raw-stream-payload'

export const Route = createFileRoute('/raw/$id')({
  loader: ({ params }) => ({
    marker: rawStreamPeakMarker,
    data: new RawStream(createRawStreamSource(params.id)),
  }),
  component: RawComponent,
})

function RawComponent() {
  const data = Route.useLoaderData()

  return <main data-bench={rawStreamPeakMarker}>{data.marker}</main>
}
