import {
  DestroyRef,
  inject,
  Injector,
  inputBinding,
  Provider,
  ViewContainerRef,
} from '@angular/core'
import { RouteComponent } from './route'

// Utility to dinamically render a component
// on the component that calls it

type RenderParams = {
  key?: string
  component: RouteComponent | null | undefined
  inputs?: Record<string, () => unknown>
  providers?: Provider[]
}

export function injectDynamicRenderer() {
  const vcr = inject(ViewContainerRef)
  const parent = inject(Injector)

  inject(DestroyRef).onDestroy(() => {
    vcr.clear()
  })

  let lastComponent: RouteComponent | null = null
  let lastKey: string | null = null

  const clear = () => {
    vcr.clear()
    lastComponent = null
    lastKey = null
  }

  return {
    clear,
    render: ({ component, providers = [], key, inputs }: RenderParams) => {
      if (lastComponent === component && lastKey === key) {
        return
      }

      if (!component) return void clear()

      const injector = Injector.create({ providers, parent })
      const bindings = Object.entries(inputs ?? {}).map(([name, value]) =>
        inputBinding(name, value),
      )
      const cmpRef = vcr.createComponent(component, { injector, bindings })
      cmpRef.changeDetectorRef.markForCheck()

      lastComponent = component
      lastKey = key ?? null
    },
  }
}
