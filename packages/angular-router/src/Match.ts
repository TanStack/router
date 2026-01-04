import {
  Component,
  computed,
  effect,
  inject,
  input,
  Provider,
  Signal,
} from '@angular/core'
import { injectRouter } from './injectRouter'
import { injectRouterState } from './injectRouterState'
import {
  AnyRoute,
  AnyRouter,
  createControlledPromise,
  getLocationChangeInfo,
  rootRouteId,
} from '@tanstack/router-core'
import warning from 'tiny-warning'
import { DefaultNotFoundComponent } from './DefaultNotFound'
import { MATCH_ID_INJECTOR_TOKEN } from './matchInjectorToken'
import { RouteComponent } from './route'
import { injectDynamicRenderer } from './dynamicRenderer'
import { ERROR_STATE_INJECTOR_TOKEN } from './injectErrorState'

// In Angular, there is not concept of suspense or error boundaries,
// so we dont' need to wrap the inner content of the match.
// So in this adapter, we use derived state instead of state boundaries.

// Equivalent to the OnRendered component.
function injectOnRendered({
  parentRouteId,
  rootRouteId,
}: {
  parentRouteId: Signal<string>
  rootRouteId: Signal<string>
}) {
  const router = injectRouter({ warn: false })

  const location = injectRouterState({
    select: (s) => s.resolvedLocation?.state.key,
  })

  const isRootRoute = computed(() => parentRouteId() === rootRouteId())

  effect(() => {
    if (!isRootRoute()) return
    location() // Track location

    router.emit({
      type: 'onRendered',
      ...getLocationChangeInfo(router.state),
    })
  })
}

@Component({
  selector: 'router-match',
  template: '',
  standalone: true,
  host: {
    '[attr.data-matchId]': 'matchId()',
  },
})
export class RouteMatch {
  matchId = input.required<string>()

  router = injectRouter()

  matches = injectRouterState({
    select: (s) => s.matches,
  })

  matchData = computed(() => {
    const matchIndex = this.matches().findIndex((d) => d.id === this.matchId())
    if (matchIndex === -1) return null

    const match = this.matches()[matchIndex]!
    const parentRouteId =
      matchIndex > 0 ? this.matches()[matchIndex - 1]?.routeId : null

    const routeId = match.routeId
    const route = this.router.routesById[routeId] as AnyRoute
    const remountFn =
      route.options.remountDeps ?? this.router.options.defaultRemountDeps

    const remountDeps = remountFn?.({
      routeId,
      loaderDeps: match.loaderDeps,
      params: match._strictParams,
      search: match._strictSearch,
    })
    const key = remountDeps ? JSON.stringify(remountDeps) : undefined

    return {
      key,
      route,
      match,
      parentRouteId,
    }
  })

  isFistRouteInRouteTree = computed(
    () => this.matchData()?.parentRouteId === rootRouteId,
  )

  resolvedNoSsr = computed(() => {
    const match = this.matchData()?.match
    if (!match) return true
    return match.ssr === false || match.ssr === 'data-only'
  })

  shouldClientOnly = computed(() => {
    const match = this.matchData()?.match
    if (!match) return true
    return this.resolvedNoSsr() || !!match._displayPending
  })

  rendering = injectDynamicRenderer()

  render = effect(() => {
    const matchData = this.matchData()
    if (!matchData) return

    if (this.shouldClientOnly() && this.router.isServer) {
      this.rendering.clear()
      return
    }

    const { match, route } = matchData

    if (match.status === 'notFound') {
      const NotFoundComponent = getNotFoundComponent(this.router, route)

      this.rendering.render({ component: NotFoundComponent })
    } else if (match.status === 'error') {
      const RouteErrorComponent =
        getComponent(route.options.errorComponent) ??
        getComponent(this.router.options.defaultErrorComponent)

      this.rendering.render({
        component: RouteErrorComponent || null,
        providers: [
          {
            provide: ERROR_STATE_INJECTOR_TOKEN,
            useValue: {
              error: match.error,
              reset: () => {
                this.router.invalidate()
              },
              info: { componentStack: '' },
            },
          },
        ],
      })
    } else if (
      match._forcePending ||
      match._displayPending ||
      match.status === 'redirected' ||
      match.status === 'pending'
    ) {
      const pendingMinMs =
        route.options.pendingMinMs ?? this.router.options.defaultPendingMinMs

      // If the compoennt is pending and has a minPendingMs,
      // we create a promise that will be awaited in the route core
      // to ensure that the pending state is displayed for that amount of time
      if (
        match.status === 'pending' &&
        pendingMinMs &&
        !match._nonReactive.minPendingPromise &&
        !this.router.isServer
      ) {
        const minPendingPromise = createControlledPromise<void>()

        match._nonReactive.minPendingPromise = minPendingPromise

        setTimeout(() => {
          minPendingPromise.resolve()
          match._nonReactive.minPendingPromise = undefined
        }, pendingMinMs)
      }

      const PendingComponent =
        getComponent(route.options.pendingComponent) ??
        getComponent(this.router.options.defaultPendingComponent)

      this.rendering.render({ component: PendingComponent })
    } else if (match.status === 'success') {
      const Component =
        getComponent(route.options.component) ??
        getComponent(this.router.options.defaultComponent) ??
        Outlet

      const key = matchData.key

      const matchIdSignal = computed(() => this.matchId())
      this.rendering.render({
        key,
        component: Component,
        providers: [
          {
            provide: MATCH_ID_INJECTOR_TOKEN,
            useValue: matchIdSignal,
          },
        ],
      })
    }
  })
}

@Component({
  selector: 'outlet',
  template: '',
  standalone: true,
})
export class Outlet {
  router = injectRouter()
  matchId = inject(MATCH_ID_INJECTOR_TOKEN)

  routeId = injectRouterState({
    select: (s) =>
      s.matches.find((d) => d.id === this.matchId())?.routeId as string,
  })

  route = computed(() => this.router.routesById[this.routeId()] as AnyRoute)

  parentGlobalNotFound = injectRouterState({
    select: (s) => {
      const matches = s.matches
      const parentMatch = matches.find((d) => d.id === this.matchId())
      if (!parentMatch) return false
      return parentMatch.globalNotFound
    },
  })

  childMatchId = injectRouterState({
    select: (s) => {
      const matches = s.matches
      const index = matches.findIndex((d) => d.id === this.matchId())
      const child = matches[index + 1]
      if (!child) return null

      return child.id
    },
  })

  rendering = injectDynamicRenderer()

  render = effect(() => {
    if (this.parentGlobalNotFound()) {
      // Render not found with warning
      const NotFoundComponent = getNotFoundComponent(this.router, this.route())
      this.rendering.render({ component: NotFoundComponent })
      return
    }
    const childMatchId = this.childMatchId()

    if (!childMatchId) {
      // Do not render anything
      this.rendering.clear()
      return
    }

    this.rendering.render({
      component: RouteMatch,
      inputs: {
        matchId: () => this.childMatchId(),
      },
    })
  })
}

function getNotFoundComponent(router: AnyRouter, route: AnyRoute) {
  let NotFoundComponent =
    getComponent(route.options.notFoundComponent) ??
    getComponent(router.options.defaultNotFoundComponent)

  if (NotFoundComponent) {
    return NotFoundComponent
  }

  if (process.env.NODE_ENV === 'development') {
    warning(
      route.options.notFoundComponent,
      `A notFoundError was encountered on the route with ID "${route.id}", but a notFoundComponent option was not configured, nor was a router level defaultNotFoundComponent configured. Consider configuring at least one of these to avoid TanStack Router's overly generic defaultNotFoundComponent (<p>Page not found</p>)`,
    )
  }

  return DefaultNotFoundComponent
}

type CalledIfFunction<T> = T extends (...args: any[]) => any ? ReturnType<T> : T

function getComponent<T>(routeComponent: T): CalledIfFunction<T> {
  if (typeof routeComponent === 'function') {
    return routeComponent()
  }
  return routeComponent as any
}
