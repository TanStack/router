import { getClientRouteTreeContent } from './route-tree-state'

export default function routeTreeLoader(this: any) {
  const callback = this.async()
  getClientRouteTreeContent()
    .then((code) => callback(null, code))
    .catch((error) => callback(error))
}
