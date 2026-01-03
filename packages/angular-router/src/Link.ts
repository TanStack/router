import {
  computed,
  Directive,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core'
import {
  AnyRouter,
  deepEqual,
  exactPathTest,
  LinkCurrentTargetElement,
  LinkOptions,
  preloadWarning,
  RegisteredRouter,
  removeTrailingSlash,
  RoutePaths,
} from '@tanstack/router-core'
import { injectRouterState } from './injectRouterState'
import { injectRouter } from './injectRouter'
import { injectIntersectionObserver } from './injectIntersectionObserver'

@Directive({
  selector: 'a[router-link]',
  exportAs: 'routerLink',
  standalone: true,
  host: {
    '[href]': 'hrefOption()?.href',
    '(click)': 'handleClick($event)',
    '(focus)': 'handleFocus($event)',
    '(mouseenter)': 'handleEnter($event)',
    '(mouseover)': 'handleEnter($event)',
    '(mouseleave)': 'handleLeave($event)',
    '(touchstart)': 'handleTouchStart($event)',
    '[attr.target]': 'target()',
    '[attr.role]': 'disabled() ? "link" : undefined',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.data-status]': 'isActive() ? "active" : undefined',
    '[attr.aria-current]': 'isActive() ? "page" : undefined',
    '[attr.data-transitioning]':
      'isTransitioning() ? "transitioning" : undefined',
  },
})
export class RouterLink {
  options = input.required<LinkInputOptions>({ alias: 'router-link' })

  protected router = injectRouter()
  protected isTransitioning = signal(false)

  protected currentSearch = injectRouterState({
    select: (s) => s.location.searchStr,
  })

  protected from = computed(() => untracked(() => this.options().from))

  protected disabled = computed(() => this._options().disabled ?? false)
  protected target = computed(() => this._options().target)

  protected _options = computed(() => {
    return {
      ...this.options(),
      from: this.from(),
    }
  })

  protected nextLocation = computed(() => {
    this.currentSearch()
    return this.router.buildLocation(this._options())
  })

  protected hrefOption = computed(() => {
    if (this._options().disabled) {
      return undefined
    }

    let href
    const maskedLocation = this.nextLocation().maskedLocation
    if (maskedLocation) {
      href = maskedLocation.url.href
    } else {
      href = this.nextLocation().url.href
    }
    let external = false
    if (this.router.origin) {
      if (href.startsWith(this.router.origin)) {
        href = this.router.history.createHref(
          href.replace(this.router.origin, ''),
        )
      } else {
        external = true
      }
    }
    return { href, external }
  })

  protected externalLink = computed(() => {
    const hrefOption = this.hrefOption()
    if (hrefOption?.external) {
      return hrefOption.href
    }
    try {
      new URL(this.options()['to'] as any)
      return this.options()['to']
    } catch {}
    return undefined
  })

  protected preload = computed(() => {
    if (this.options()['reloadDocument']) {
      return false
    }
    return this.options()['preload'] ?? this.router.options.defaultPreload
  })

  protected preloadDelay = computed(() => {
    return (
      this.options()['preloadDelay'] ??
      this.router.options.defaultPreloadDelay ??
      0
    )
  })

  protected isActive = injectRouterState({
    select: (s) => {
      if (this.externalLink()) return false

      const options = this.options()

      if (options.activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          this.nextLocation().pathname,
          this.router.basepath,
        )
        if (!testExact) {
          return false
        }
      } else {
        const currentPathSplit = removeTrailingSlash(
          s.location.pathname,
          this.router.basepath,
        )
        const nextPathSplit = removeTrailingSlash(
          this.nextLocation().pathname,
          this.router.basepath,
        )

        const pathIsFuzzyEqual =
          currentPathSplit.startsWith(nextPathSplit) &&
          (currentPathSplit.length === nextPathSplit.length ||
            currentPathSplit[nextPathSplit.length] === '/')

        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      if (options.activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(
          s.location.search,
          this.nextLocation().search,
          {
            partial: !options.activeOptions?.exact,
            ignoreUndefined: !options.activeOptions?.explicitUndefined,
          },
        )
        if (!searchTest) {
          return false
        }
      }

      if (options.activeOptions?.includeHash) {
        return s.location.hash === this.nextLocation().hash
      }
      return true
    },
  })

  protected doPreload = () => {
    this.router.preloadRoute(this.options() as any).catch((err: any) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }

  protected preloadViewportIoCallback = (
    entry: IntersectionObserverEntry | undefined,
  ) => {
    if (entry?.isIntersecting) {
      this.doPreload()
    }
  }

  private viewportPreloader = injectIntersectionObserver(
    this.preloadViewportIoCallback,
    { rootMargin: '100px' },
    () => !!this._options().disabled || !(this.preload() === 'viewport'),
  )

  private hasRenderFetched = false
  private rendererPreloader = effect(() => {
    if (this.hasRenderFetched) return

    if (!this._options().disabled && this.preload() === 'render') {
      this.doPreload()
      this.hasRenderFetched = true
    }
  })

  protected handleClick = (event: MouseEvent) => {
    const elementTarget = (
      event.currentTarget as HTMLAnchorElement | SVGAElement
    ).getAttribute('target')
    const target = this._options().target
    const effectiveTarget = target !== undefined ? target : elementTarget

    if (
      !this._options().disabled &&
      !isCtrlEvent(event) &&
      !event.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      event.button === 0
    ) {
      event.preventDefault()

      this.isTransitioning.set(true)

      const unsub = this.router.subscribe('onResolved', () => {
        unsub()
        this.isTransitioning.set(false)
      })

      this.router.navigate(this._options())
    }
  }

  protected handleFocus = (event: FocusEvent) => {
    if (this._options().disabled) return
    if (this.preload()) {
      this.doPreload()
    }
  }

  protected handleTouchStart = (event: TouchEvent) => {
    if (this._options().disabled) return
    if (this.preload()) {
      this.doPreload()
    }
  }

  protected handleEnter = (event: MouseEvent) => {
    if (this._options().disabled) return
    const eventTarget = (event.currentTarget || {}) as LinkCurrentTargetElement

    if (this.preload()) {
      if (eventTarget.preloadTimeout) {
        return
      }

      eventTarget.preloadTimeout = setTimeout(() => {
        eventTarget.preloadTimeout = null
        this.doPreload()
      }, this.preloadDelay())
    }
  }

  protected handleLeave = (event: MouseEvent) => {
    if (this._options().disabled) return
    const eventTarget = (event.currentTarget || {}) as LinkCurrentTargetElement

    if (eventTarget.preloadTimeout) {
      clearTimeout(eventTarget.preloadTimeout)
      eventTarget.preloadTimeout = null
    }
  }
}

export type LinkInputOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}
