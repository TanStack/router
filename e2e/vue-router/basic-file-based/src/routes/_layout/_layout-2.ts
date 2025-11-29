import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import Layout2Component from '../-components/Layout2Component.vue'

export const Route = createFileRoute('/_layout/_layout-2')({
  component: () => h(Layout2Component),
})
