import { createFileRoute } from '@tanstack/vue-router'
import SfcServerFn from '~/components/SfcServerFn.vue'

export const Route = createFileRoute('/vue-sfc')({
  component: SfcServerFn,
})
