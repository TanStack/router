import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import LayoutAComponent from '../../-components/LayoutAComponent.vue'

export const Route = createFileRoute('/_layout/_layout-2/layout-a')({
  component: () => h(LayoutAComponent),
})
