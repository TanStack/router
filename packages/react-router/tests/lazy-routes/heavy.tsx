import { createLazyRoute } from '../../src'
import HeavyComponent from '../components/mockHeavyDependenciesRoute'

export default function Route(id: string) {
  return createLazyRoute(id)({
    component: HeavyComponent,
  })
}
