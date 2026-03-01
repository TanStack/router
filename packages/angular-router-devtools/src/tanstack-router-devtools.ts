import {
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input, runInInjectionContext 
} from '@angular/core'
import { TanStackRouterDevtoolsCore } from '@tanstack/router-devtools-core'
import { injectRouter } from '@tanstack/angular-router-experimental'
import { injectLazyRouterState } from './utils'
import type { AnyRouter } from '@tanstack/router-core'

export interface TanStackRouterDevtoolsOptions {
  /**
   * Set this true if you want the dev tools to default to being open
   */
  initialIsOpen?: boolean
  /**
   * Use this to add props to the panel. For example, you can add className, style (merge and override default style), etc.
   */
  panelProps?: Record<string, any>
  /**
   * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  closeButtonProps?: Record<string, any>
  /**
   * Use this to add props to the toggle button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  toggleButtonProps?: Record<string, any>
  /**
   * The position of the TanStack Router logo to open and close the devtools panel.
   * Defaults to 'bottom-left'.
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /**
   * Use this to render the devtools inside a different type of container element for a11y purposes.
   * Any string which corresponds to a valid intrinsic JSX element is allowed.
   * Defaults to 'footer'.
   */
  containerElement?: string | any
  /**
   * The router instance to use for the devtools, infered in the injector context if no provided.
   */
  router?: AnyRouter
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

@Component({
  selector: 'router-devtools',
  template: '',
})
export class TanStackRouterDevtools implements OnInit {
  initialIsOpen = input<TanStackRouterDevtoolsOptions['initialIsOpen']>()
  panelProps = input<TanStackRouterDevtoolsOptions['panelProps']>()
  closeButtonProps = input<TanStackRouterDevtoolsOptions['closeButtonProps']>()
  toggleButtonProps =
    input<TanStackRouterDevtoolsOptions['toggleButtonProps']>()
  position = input<TanStackRouterDevtoolsOptions['position']>()
  containerElement = input<TanStackRouterDevtoolsOptions['containerElement']>()
  inputRouter = input<TanStackRouterDevtoolsOptions['router']>(undefined, {
    alias: 'router',
  })
  shadowDOMTarget = input<TanStackRouterDevtoolsOptions['shadowDOMTarget']>()

  private elementRef = inject(ElementRef<HTMLElement>)

  private contextRouter = injectRouter({ warn: false })
  private router = computed(() => this.inputRouter() ?? this.contextRouter)
  private routerState = injectLazyRouterState(this.router)

  private injector = inject(EnvironmentInjector)

  ngOnInit() {
    // Since inputs are not available before component initialization,
    // we attach every effect and derived signal to the ngOnInit lifecycle hook
    runInInjectionContext(this.injector, () => {
      const devtools = new TanStackRouterDevtoolsCore({
        initialIsOpen: this.initialIsOpen(),
        panelProps: this.panelProps(),
        closeButtonProps: this.closeButtonProps(),
        toggleButtonProps: this.toggleButtonProps(),
        position: this.position(),
        containerElement: this.containerElement(),
        shadowDOMTarget: this.shadowDOMTarget(),
        router: this.router(),
        routerState: this.routerState(),
      })

      effect(() => {
        devtools.setRouter(this.router())
      })

      effect(() => {
        devtools.setRouterState(this.routerState())
      })

      effect(() => {
        devtools.setOptions({
          initialIsOpen: this.initialIsOpen(),
          panelProps: this.panelProps(),
          closeButtonProps: this.closeButtonProps(),
          toggleButtonProps: this.toggleButtonProps(),
          position: this.position(),
          containerElement: this.containerElement(),
          shadowDOMTarget: this.shadowDOMTarget(),
        })
      })

      afterNextRender(() => {
        devtools.mount(this.elementRef.nativeElement)
      })

      inject(DestroyRef).onDestroy(() => {
        devtools.unmount()
      })
    })
  }
}
