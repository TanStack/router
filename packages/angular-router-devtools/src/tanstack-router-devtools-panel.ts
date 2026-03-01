import {
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  runInInjectionContext,
} from '@angular/core'
import { TanStackRouterDevtoolsPanelCore } from '@tanstack/router-devtools-core'
import { injectRouter } from '@tanstack/angular-router-experimental'
import { injectLazyRouterState } from './utils'
import type { AnyRouter } from '@tanstack/router-core'

export interface TanStackRouterDevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: Record<string, any>
  /**
   * The standard React class property used to style a component with classes
   */
  className?: string
  /**
   * A boolean variable indicating whether the panel is open or closed
   */
  isOpen?: boolean
  /**
   * A function that toggles the open and close state of the panel
   */
  setIsOpen?: (isOpen: boolean) => void
  /**
   * Handles the opening and closing the devtools panel
   */
  handleDragStart?: (e: any) => void
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
  selector: 'tanstack-router-devtools-panel',
  template: '',
  styles: `
    :host {
      display: block;
    }
  `,
})
export class TanStackRouterDevtoolsPanel {
  style = input<TanStackRouterDevtoolsPanelOptions['style']>()
  className = input<TanStackRouterDevtoolsPanelOptions['className']>()
  isOpen = input<TanStackRouterDevtoolsPanelOptions['isOpen']>()
  setIsOpen = input<TanStackRouterDevtoolsPanelOptions['setIsOpen']>()
  handleDragStart =
    input<TanStackRouterDevtoolsPanelOptions['handleDragStart']>()
  inputRouter = input<TanStackRouterDevtoolsPanelOptions['router']>(undefined, {
    alias: 'router',
  })
  shadowDOMTarget =
    input<TanStackRouterDevtoolsPanelOptions['shadowDOMTarget']>()

  private elementRef = inject(ElementRef<HTMLElement>)

  private contextRouter = injectRouter({ warn: false })
  private router = computed(() => this.inputRouter() ?? this.contextRouter)
  private routerState = injectLazyRouterState(this.router)

  private injector = inject(EnvironmentInjector)

  ngOnInit() {
    // Since inputs are not available before component initialization,
    // we attach every effect and derived signal to the ngOnInit lifecycle hook
    runInInjectionContext(this.injector, () => {
      const devtoolsPanel = new TanStackRouterDevtoolsPanelCore({
        style: this.style(),
        className: this.className(),
        isOpen: this.isOpen(),
        setIsOpen: this.setIsOpen(),
        handleDragStart: this.handleDragStart(),
        router: this.router(),
        routerState: this.routerState(),
      })

      effect(() => {
        devtoolsPanel.setRouter(this.router())
      })

      effect(() => {
        devtoolsPanel.setRouterState(this.routerState())
      })

      effect(() => {
        devtoolsPanel.setOptions({
          style: this.style(),
          className: this.className(),
          isOpen: this.isOpen(),
          setIsOpen: this.setIsOpen(),
          handleDragStart: this.handleDragStart(),
        })
      })

      afterNextRender(() => {
        devtoolsPanel.mount(this.elementRef.nativeElement)
      })

      inject(DestroyRef).onDestroy(() => {
        devtoolsPanel.unmount()
      })
    })
  }
}
