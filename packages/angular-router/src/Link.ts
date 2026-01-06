import * as Angular from '@angular/core'
import {
  AnyRouter,
  deepEqual,
  exactPathTest,
  LinkCurrentTargetElement,
  LinkOptions as CoreLinkOptions,
  preloadWarning,
  RegisteredRouter,
  removeTrailingSlash,
  RoutePaths,
} from '@tanstack/router-core'
import { injectRouterState } from './injectRouterState'
import { injectRouter } from './injectRouter'
import { injectIntersectionObserver } from './injectIntersectionObserver'

@Angular.Directive({
  selector: 'a[link]',
  exportAs: 'link',
  standalone: true,
  host: {
    '[href]': 'hrefOption()?.href',
    '(click)': 'handleClick($event)',
    '(focus)': 'handleFocus($event)',
    '(mouseenter)': 'handleEnter($event)',
    '(mouseover)': 'handleEnter($event)',
    '(mouseleave)': 'handleLeave($event)',
    '[attr.target]': 'target()',
    '[attr.role]': 'disabled() ? "link" : undefined',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.data-status]': 'isActive() ? "active" : undefined',
    '[attr.aria-current]': 'isActive() ? "page" : undefined',
    '[attr.data-transitioning]':
      'isTransitioning() ? "transitioning" : undefined',
  },
})
export class Link<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> {
  #passiveEvents = injectPasiveEvents(() => ({
    touchstart: this.handleTouchStart,
  }))

  options = Angular.input.required<
    LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
  >({ alias: 'link' })

  protected router = injectRouter()
  protected isTransitioning = Angular.signal(false)

  protected currentSearch = injectRouterState({
    select: (s) => s.location.searchStr,
  })

  protected from = Angular.computed(() =>
    Angular.untracked(() => this.options().from),
  )

  protected disabled = Angular.computed(() => this._options().disabled ?? false)
  protected target = Angular.computed(() => this._options().target)

  protected _options = Angular.computed<
    LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
  >(() => {
    return {
      ...this.options(),
      from: this.from(),
    }
  })

  protected nextLocation = Angular.computed(() => {
    this.currentSearch()
    return this.router.buildLocation(this._options() as any)
  })

  protected hrefOption = Angular.computed(() => {
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

  protected externalLink = Angular.computed(() => {
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

  protected preload = Angular.computed(() => {
    if (this.options()['reloadDocument']) {
      return false
    }
    return this.options()['preload'] ?? this.router.options.defaultPreload
  })

  protected preloadDelay = Angular.computed(() => {
    return (
      this.options()['preloadDelay'] ??
      this.router.options.defaultPreloadDelay ??
      0
    )
  })

  protected location = injectRouterState({
    select: (s) => s.location,
  })

  protected isActive = Angular.computed(() => {
    if (this.externalLink()) return false

    const options = this.options()

    if (options.activeOptions?.exact) {
      const testExact = exactPathTest(
        this.location().pathname,
        this.nextLocation().pathname,
        this.router.basepath,
      )
      if (!testExact) {
        return false
      }
    } else {
      const currentPathSplit = removeTrailingSlash(
        this.location().pathname,
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
        this.location().search,
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
      return this.location().hash === this.nextLocation().hash
    }
    return true
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
  private rendererPreloader = Angular.effect(() => {
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

export type LinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = CoreLinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & {}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

// Angular does not provide by default passive events listeners
// to some events like React, and does not support a pasive options
// in the template, so we attach the pasive events manually here

type PassiveEvents = {
  touchstart: (event: TouchEvent) => void
}

function injectPasiveEvents(passiveEvents: () => PassiveEvents) {
  const element = Angular.inject(Angular.ElementRef).nativeElement
  const renderer = Angular.inject(Angular.Renderer2)

  Angular.afterNextRender(() => {
    for (const [event, handler] of Object.entries(passiveEvents())) {
      renderer.listen(element, event, handler, {
        passive: true,
      })
    }
  })
}
