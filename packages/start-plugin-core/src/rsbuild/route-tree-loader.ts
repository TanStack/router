import { getClientRouteTreeContent } from './route-tree-state'

export default function routeTreeLoader(this: any) {
  const callback = this.async()
  const options = this.getOptions() as {
    routerConfig?: any
    root?: string
  }
  getClientRouteTreeContent({
    routerConfig: options.routerConfig,
    root: options.root,
  })
    .then((code) => callback(null, code))
    .catch((error) => callback(error))
}
