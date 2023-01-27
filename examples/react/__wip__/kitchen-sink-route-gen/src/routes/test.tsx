import { routeConfig } from '../routes.generated/test'

routeConfig.generate({
  component: () => null,
  errorComponent: () => null,
  onLoad: () => ({ test: 'test' }),
})
