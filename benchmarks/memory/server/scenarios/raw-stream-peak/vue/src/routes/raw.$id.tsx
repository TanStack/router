import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { RawStream } from '@tanstack/vue-start'
import {
  createRawStreamSource,
  rawStreamPeakMarker,
} from '../../../raw-stream-payload'

const RawComponent = defineComponent({
  setup() {
    const data = Route.useLoaderData()

    return () => (
      <main data-bench={rawStreamPeakMarker}>{data.value.marker}</main>
    )
  },
})

export const Route = createFileRoute('/raw/$id')({
  loader: ({ params }) => ({
    marker: rawStreamPeakMarker,
    data: new RawStream(createRawStreamSource(params.id)),
  }),
  component: RawComponent,
})
