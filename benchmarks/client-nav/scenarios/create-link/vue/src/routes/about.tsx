import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const AboutPage = Vue.defineComponent({
  setup() {
    return () => <main>about</main>
  },
})

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
