import {
  Link,
  createRootRoute,
} from '@tanstack/vue-router'
import { h } from 'vue'
import RootComponentVue from '../components/RootComponent.vue'

const RootComponent = () => h(RootComponentVue)

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    )
  },
})
