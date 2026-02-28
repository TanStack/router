import * as Angular from '@angular/core'

export type RenderValue = {
  key?: string
  component: Angular.Type<any> | null | undefined
  inputs?: Record<string, () => unknown>
  providers?: Array<Angular.Provider>
} | null | undefined

export function injectRender(renderValueFn: () => RenderValue): void {
  const vcr = Angular.inject(Angular.ViewContainerRef)
  const parent = Angular.inject(Angular.Injector)

  Angular.inject(Angular.DestroyRef).onDestroy(() => {
    vcr.clear()
  })

  let lastKey: Array<any> = [];

  Angular.effect(() => {
    const renderValue = renderValueFn()

    const newKey = resolvedKey(renderValue)
    if (keysAreEqual(lastKey, newKey)) return

    // Clear if there was a previous value
    if (lastKey.length > 0) vcr.clear()

    // Update component
    lastKey = newKey

    // No value, do not render
    const component = renderValue?.component
    if (!component) return

    // Angular renderer code
    const providers = renderValue.providers ?? []
    const injector = Angular.Injector.create({ providers, parent })
    const bindings = Object.entries(renderValue.inputs ?? {}).map(([name, value]) =>
      Angular.inputBinding(name, value),
    )
    const cmpRef = vcr.createComponent(component, { injector, bindings })
    cmpRef.changeDetectorRef.markForCheck()
  })
}

function resolvedKey(value: RenderValue) {
  const component = value?.component
  if (!value || !component) return []
  return [component, value.key]
}

function keysAreEqual(a: Array<any>, b: Array<any>) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
