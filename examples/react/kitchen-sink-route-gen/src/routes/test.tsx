import { routeConfig } from '../routes.generated/test'

routeConfig.generate({
  component: () => null,
  errorComponent: () => null,
  loader: () => ({ test: 'test' }),
})
