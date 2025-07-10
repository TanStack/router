import { h } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import Home from '../components/Home.vue'

export const Route = createFileRoute('/')({
  component: () => h(Home),
})
