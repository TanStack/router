import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import LayoutBComponent from '../../-components/LayoutBComponent.vue'

export const Route = createFileRoute('/_layout/_layout-2/layout-b')({
  component: () => h(LayoutBComponent),
})
