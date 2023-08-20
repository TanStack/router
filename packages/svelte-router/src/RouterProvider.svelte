<script lang="ts" context="module">
import {
  AnyRoutesInfo,
  DefaultRoutesInfo,
  AnyRoute,
  Router,
  RouterOptions
} from '@tanstack/router-core'
type Dictionary = Record<string, any>
</script>

<script lang="ts" generics="
TRouteConfig extends AnyRoute = AnyRoute,
TRoutesInfo extends AnyRoutesInfo = DefaultRoutesInfo,
TDehydrated extends Dictionary = Dictionary,
">
import { writable } from 'svelte/store'
import { registerRouterContext } from './hooks'
import Matches from './Matches.svelte'

export let router: Router<TRouteConfig, TRoutesInfo>
export let context: Partial<RouterOptions<TRouteConfig, TDehydrated>['context']>

const routerStore = writable(router)
registerRouterContext(routerStore)

const onRouterChange = (newRouter: Router) => {
  newRouter.mount()
  $routerStore = newRouter
}

$: onRouterChange(router)
$: router.update(context)
</script>


<Matches />
