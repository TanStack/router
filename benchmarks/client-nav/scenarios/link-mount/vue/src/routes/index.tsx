import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import { LinkListToggle } from '../linkList'
import { readyTestId } from '../../../shared'

const HomePage = Vue.defineComponent({
  setup() {
    return () => (
      <main>
        <p data-testid={readyTestId}>home</p>
        <LinkListToggle />
      </main>
    )
  },
})

export const Route = createFileRoute('/')({
  component: HomePage,
})
