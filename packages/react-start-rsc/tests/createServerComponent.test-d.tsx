/**
 * Types of `createCompositeComponent` and `<CompositeComponent>` as an app
 * uses them (guide/server-components.md): the composite a server function
 * creates, and the slot props the page must, may and must not pass. Checked
 * by `test:types` (`tsc -p tests`), not run.
 *
 * The calls are in functions nothing runs (the client entry's
 * `createCompositeComponent` throws); only the types they infer are read.
 */
import { expectTypeOf, test } from 'vitest'
import { CompositeComponent, createCompositeComponent } from '../src/index'
import type { ComponentType, ReactNode } from 'react'

const _card = () =>
  createCompositeComponent(
    (props: {
      children?: ReactNode
      header: (title: string) => ReactNode
      renderActions?: () => ReactNode
      AddToCart: ComponentType<{ productId: string; price: number }>
    }) => (
      <div>
        {props.header('MARK_TITLE')}
        {props.children}
        {props.renderActions?.()}
        <props.AddToCart productId="p1" price={1} />
      </div>
    ),
  )
const src = null as unknown as Awaited<ReturnType<typeof _card>>

function AddToCart(_props: { productId: string; price: number }) {
  return null
}

test('the page passes the slots the server component declares', () => {
  void (
    <CompositeComponent
      src={src}
      header={(title) => {
        expectTypeOf(title).toEqualTypeOf<string>()
        return <h1>{title}</h1>
      }}
      renderActions={() => <button>buy</button>}
      AddToCart={AddToCart}
    >
      <em>slot</em>
    </CompositeComponent>
  )
  // Optional slots may be left out
  void (
    <CompositeComponent src={src} header={() => null} AddToCart={AddToCart} />
  )
})

test('a required slot is required', () => {
  // @ts-expect-error `header` is missing
  void (<CompositeComponent src={src} AddToCart={AddToCart} />)
})

test('a slot of the wrong shape is rejected', () => {
  void (
    <CompositeComponent
      src={src}
      // @ts-expect-error `header` receives a string, not a number
      header={(title: number) => title}
      AddToCart={AddToCart}
    />
  )
  function Other(_props: { sku: number }) {
    return null
  }
  // @ts-expect-error `AddToCart` receives `productId` and `price`
  void (<CompositeComponent src={src} header={() => null} AddToCart={Other} />)
})

test('a slot the server component does not declare is rejected', () => {
  void (
    <CompositeComponent
      src={src}
      header={() => null}
      AddToCart={AddToCart}
      // @ts-expect-error no `footer` slot
      footer={() => null}
    />
  )
})

test('a server component without props takes no slots', () => {
  const _plain = () => createCompositeComponent(() => <footer>MARK</footer>)
  const footer = null as unknown as Awaited<ReturnType<typeof _plain>>
  void (<CompositeComponent src={footer} />)
  // @ts-expect-error no `header` slot
  void (<CompositeComponent src={footer} header={() => null} />)
})

test('render prop arguments must be serializable', () => {
  void (() =>
    createCompositeComponent(
      // @ts-expect-error a function cannot travel through the Flight payload
      (props: { render: (data: { onClick: () => void }) => ReactNode }) =>
        props.render({ onClick: () => {} }),
    ))
  // Serializable arguments are fine
  void (() =>
    createCompositeComponent(
      (props: { render: (data: { id: string; count: number }) => ReactNode }) =>
        props.render({ id: 'a', count: 1 }),
    ))
})

test('a server component that renders nothing renderable is rejected', () => {
  // @ts-expect-error the component returns `void`
  void (() => createCompositeComponent(() => {}))
})

test('composites returned together keep their own slots', () => {
  const _layout = async () => {
    const [Header, Footer] = await Promise.all([
      createCompositeComponent((props: { children?: ReactNode }) => (
        <header>{props.children}</header>
      )),
      createCompositeComponent((props: { renderActions?: () => ReactNode }) => (
        <footer>{props.renderActions?.()}</footer>
      )),
    ])
    return { Header, Footer }
  }
  const Layout = null as unknown as Awaited<ReturnType<typeof _layout>>
  void (
    <CompositeComponent src={Layout.Header}>
      <em>slot</em>
    </CompositeComponent>
  )
  void (<CompositeComponent src={Layout.Footer} renderActions={() => null} />)
  // @ts-expect-error `renderActions` is the footer's slot
  void (<CompositeComponent src={Layout.Header} renderActions={() => null} />)
})
