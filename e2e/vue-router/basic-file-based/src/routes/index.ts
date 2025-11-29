import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import IndexComponent from './-components/IndexComponent.vue'

export const Route = createFileRoute('/')({
  component: () => h(IndexComponent),
})
