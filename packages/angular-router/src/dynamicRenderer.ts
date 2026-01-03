import {
  DestroyRef,
  inject,
  Injector,
  inputBinding,
  Provider,
  Type,
  ViewContainerRef,
} from '@angular/core'

// Utility to dinamically render a component
// on the component that calls it

type RenderParams = {
  key?: string
  component: Type<any> | null | undefined
  inputs?: Record<string, () => unknown>
  providers?: Provider[]
}

export function injectDynamicRenderer() {
  const vcr = inject(ViewContainerRef)
  const parent = inject(Injector)

  inject(DestroyRef).onDestroy(() => {
    vcr.clear()
  })

  let lastComponent: Type<any> | null = null
  let lastKey: string | null = null

  const clear = () => {
    if (lastComponent) vcr.clear()
    lastComponent = null
    lastKey = null
  }

  return {
    clear,
    render: ({ component, providers = [], key, inputs }: RenderParams) => {
      const normalizedKey = key ?? null
      if (lastComponent === component && lastKey === normalizedKey) {
        return
      }

      vcr.clear()

      if (!component) return

      const injector = Injector.create({ providers, parent })
      const bindings = Object.entries(inputs ?? {}).map(([name, value]) =>
        inputBinding(name, value),
      )
      const cmpRef = vcr.createComponent(component, { injector, bindings })
      cmpRef.changeDetectorRef.markForCheck()

      lastComponent = component
      lastKey = normalizedKey
    },
  }
}
