import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import LayoutComponent from './-components/LayoutComponent.vue'

export const Route = createFileRoute('/_layout')({
  component: () => h(LayoutComponent),
})
