import * as Angular from '@angular/core'

// Utility to dinamically render a component
// on the component that calls it

type RenderParams = {
  key?: string
  component: Angular.Type<any> | null | undefined
  inputs?: Record<string, () => unknown>
  providers?: Angular.Provider[]
}

export function injectDynamicRenderer() {
  const vcr = Angular.inject(Angular.ViewContainerRef)
  const parent = Angular.inject(Angular.Injector)

  Angular.inject(Angular.DestroyRef).onDestroy(() => {
    vcr.clear()
  })

  let lastComponent: Angular.Type<any> | null = null
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

      const injector = Angular.Injector.create({ providers, parent })
      const bindings = Object.entries(inputs ?? {}).map(([name, value]) =>
        Angular.inputBinding(name, value),
      )
      const cmpRef = vcr.createComponent(component, { injector, bindings })
      cmpRef.changeDetectorRef.markForCheck()

      lastComponent = component
      lastKey = normalizedKey
    },
  }
}
