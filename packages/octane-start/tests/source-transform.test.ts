import { describe, expect, it } from 'vitest'
import { compile } from 'octane/compiler'
import { transformOctaneStartSource } from '../src/plugin/source-transform'

const transform = (code: string, server = true) =>
  transformOctaneStartSource(code, '/src/route.tsrx', { server })?.code ?? code

describe('Octane Start source transform', () => {
  it('routes Start Hydrate imports through Octane before TSRX compilation', () => {
    const output = transform(`
      import { Hydrate, createServerFn } from '@tanstack/octane-start'
      export function Route() @{
        <Hydrate when={strategy}><Deferred /></Hydrate>
      }
    `)

    expect(output).toContain("import { Hydrate } from 'octane'")
    expect(output).toContain(
      "import { createServerFn } from '@tanstack/octane-start'",
    )
  })

  it('preserves aliased Hydrate bindings', () => {
    const output = transform(`
      import { Hydrate as Deferred } from '@tanstack/octane-start'
      export function Route() @{ <Deferred when={strategy}><Child /></Deferred> }
    `)

    expect(output).toContain("import { Hydrate as Deferred } from 'octane'")
  })

  it('feeds Start Hydrate through Octane native child splitting', () => {
    const source = `
      import { Hydrate } from '@tanstack/octane-start'
      import { interaction } from '@tanstack/octane-start/hydration'
      function Deferred() @{ <button data-deferred-only>{'Activate'}</button> }
      export function Route() @{
        <><p data-eager-only>{'Eager'}</p><Hydrate when={interaction({ events: 'click' })}><Deferred /></Hydrate></>
      }
    `
    const adapted = transform(source, false)
    const root = compile(adapted, '/src/route.tsrx', { mode: 'client' })
    const child = compile(adapted, '/src/route.tsrx?octane-hydrate=0', {
      mode: 'client',
    })

    expect(root.code).toContain('octane-hydrate=0')
    expect(root.code).toContain('data-eager-only')
    expect(root.code).not.toContain('data-deferred-only')
    expect(child.code).toContain('data-deferred-only')
    expect(child.code).not.toContain('data-eager-only')
  })

  it('strips children from an imported ClientOnly binding on the server', () => {
    const output = transform(`
      import { ClientOnly as BrowserOnly } from '@tanstack/octane-router'
      export function Route() @{
        <BrowserOnly fallback={<p>fallback</p>}><BrowserWidget /></BrowserOnly>
      }
    `)

    expect(output).toContain(
      '<BrowserOnly fallback={<p>fallback</p>}>{null}</BrowserOnly>',
    )
    expect(output).not.toContain('<BrowserWidget />')
  })

  it('prunes imports whose only binding uses were stripped with ClientOnly', () => {
    const output = transform(`
      import BrowserDefault, { BrowserWidget as Widget, Keep, type Props } from './mixed.client.tsrx'
      import * as BrowserNamespace from './namespace.client.tsrx'
      import Unused from './unused.client.tsrx'
      import './side-effect.client.tsrx'
      import { ClientOnly } from '@tanstack/octane-router'
      const retained = Keep
      export function Route() @{
        <ClientOnly>
          <BrowserDefault />
          <Widget />
          <BrowserNamespace.Widget />
        </ClientOnly>
      }
    `)

    expect(output).toContain(
      "import { Keep, type Props } from './mixed.client.tsrx'",
    )
    expect(output).not.toContain('BrowserDefault')
    expect(output).not.toContain('BrowserWidget as Widget')
    expect(output).not.toContain("from './namespace.client.tsrx'")
    expect(output).toContain("import Unused from './unused.client.tsrx'")
    expect(output).toContain("import './side-effect.client.tsrx'")
    expect(output).toContain('const retained = Keep')
  })

  it('preserves an import with any live use outside ClientOnly children', () => {
    const output = transform(`
      import { BrowserWidget as Widget } from './widget.client.tsrx'
      import { ClientOnly } from '@tanstack/octane-router'
      export function Route() @{
        <ClientOnly fallback={<Widget location="fallback" />}>
          <Widget location="child" />
        </ClientOnly>
      }
    `)

    expect(output).toContain(
      "import { BrowserWidget as Widget } from './widget.client.tsrx'",
    )
    expect(output).toContain('<Widget location="fallback" />')
    expect(output).not.toContain('<Widget location="child" />')
  })

  it('does not treat shadowed local uses as live uses of a pruned import', () => {
    const output = transform(`
      import { BrowserWidget as Widget } from './widget.client.tsrx'
      import { ClientOnly } from '@tanstack/octane-router'
      export function Route() @{
        <ClientOnly><Widget /></ClientOnly>
      }
      function Local(Widget) {
        return <Widget location="local" />
      }
    `)

    expect(output).not.toContain("from './widget.client.tsrx'")
    expect(output).toContain('<Widget location="local" />')
  })

  it('preserves imports used by binding-pattern default expressions', () => {
    const output = transform(`
      import {
        BrowserWidget as ParameterWidget,
        BrowserWidget as DestructuredWidget,
        BrowserWidget as KeyWidget,
      } from './widget.client.tsrx'
      import { ClientOnly } from '@tanstack/octane-router'
      const {
        component = DestructuredWidget,
        [KeyWidget]: keyedComponent,
      } = registry
      function selectComponent(candidate = ParameterWidget) {
        return candidate ?? component ?? keyedComponent
      }
      export function Route() @{
        <ClientOnly>
          <ParameterWidget />
          <DestructuredWidget />
          <KeyWidget />
        </ClientOnly>
      }
    `)

    expect(output).toContain('BrowserWidget as ParameterWidget')
    expect(output).toContain('BrowserWidget as DestructuredWidget')
    expect(output).toContain('BrowserWidget as KeyWidget')
    expect(output).toContain('component = DestructuredWidget')
    expect(output).toContain('[KeyWidget]: keyedComponent')
    expect(output).toContain('candidate = ParameterWidget')
    expect(output).not.toContain('<ParameterWidget />')
    expect(output).not.toContain('<DestructuredWidget />')
    expect(output).not.toContain('<KeyWidget />')
  })

  it('does not strip a shadowed ClientOnly binding', () => {
    const output = transform(`
      import { ClientOnly } from '@tanstack/octane-router'
      export function Route() @{
        <ClientOnly><BrowserWidget /></ClientOnly>
      }
      function Local() {
        const ClientOnly = LocalBoundary
        return <ClientOnly><LocalWidget /></ClientOnly>
      }
    `)

    expect(output).not.toContain('<BrowserWidget />')
    expect(output).toContain('<LocalWidget />')
  })

  it('respects ClientOnly bindings in loop, switch, and static-block scopes', () => {
    const output = transform(`
      import { ClientOnly } from '@tanstack/octane-router'
      export function Route() @{
        <ClientOnly><ImportedWidget /></ClientOnly>
      }
      function ForLoop() {
        for (let ClientOnly = LocalBoundary; active; advance()) {
          return <ClientOnly><ForWidget /></ClientOnly>
        }
      }
      function ForOfLoop() {
        for (const ClientOnly of boundaries) {
          return <ClientOnly><ForOfWidget /></ClientOnly>
        }
      }
      function ForInLoop() {
        for (const ClientOnly in boundaries) {
          return <ClientOnly><ForInWidget /></ClientOnly>
        }
      }
      function SwitchExample() {
        switch (kind) {
          case 'local':
            const ClientOnly = LocalBoundary
            return <ClientOnly><SwitchWidget /></ClientOnly>
        }
      }
      class StaticExample {
        static {
          const ClientOnly = LocalBoundary
          const view = <ClientOnly><StaticWidget /></ClientOnly>
        }
      }
    `)

    expect(output).not.toContain('<ImportedWidget />')
    expect(output).toContain('<ForWidget />')
    expect(output).toContain('<ForOfWidget />')
    expect(output).toContain('<ForInWidget />')
    expect(output).toContain('<SwitchWidget />')
    expect(output).toContain('<StaticWidget />')
  })

  it('strips nested imported ClientOnly children without overlapping rewrites', () => {
    const output = transform(`
      import { ClientOnly } from '@tanstack/octane-router'
      export function Route() @{
        <ClientOnly fallback={<p>outer</p>}>
          <ClientOnly fallback={<p>inner</p>}><BrowserWidget /></ClientOnly>
        </ClientOnly>
      }
    `)

    expect(output).toMatch(
      /<ClientOnly fallback={<p>outer<\/p>}>\s*\{null\}\s*<\/ClientOnly>/,
    )
    expect(output).not.toContain('<BrowserWidget />')
    expect(output).not.toContain('{null}ntOnly>')
  })

  it('does not strip local components that merely share the name', () => {
    const source = `
      function ClientOnly(props) @{ <>{props.children}</> }
      export function Route() @{ <ClientOnly><LocalWidget /></ClientOnly> }
    `

    expect(transform(source)).toBe(source)
  })

  it('leaves ClientOnly children intact in the client environment', () => {
    const source = `
      import { ClientOnly } from '@tanstack/octane-router'
      import BrowserWidget from './widget.client.tsrx'
      export function Route() @{ <ClientOnly><BrowserWidget /></ClientOnly> }
    `

    expect(transform(source, false)).toBe(source)
  })
})
