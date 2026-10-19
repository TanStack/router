/**
 * Types of `renderServerComponent` as an app uses it
 * (guide/server-components.md): what a server function returns is a value
 * the page renders inline (`{Renderable}`), alone or as part of an object.
 * Checked by `test:types` (`tsc -p tests`), not run.
 *
 * The calls are in functions nothing runs; only the types they infer are
 * read.
 */
import { expectTypeOf, test } from 'vitest'
import { CompositeComponent, renderServerComponent } from '../src/index'
import type { ReactNode } from 'react'

function Greeting(props: { name: string }) {
  return <h1>Hello {props.name}</h1>
}

test('the result renders inline', () => {
  const _greeting = () => renderServerComponent(<Greeting name="MARK" />)
  const Renderable = null as unknown as Awaited<ReturnType<typeof _greeting>>
  expectTypeOf(Renderable).toExtend<ReactNode>()
  void (<main>{Renderable}</main>)
})

test('results returned together each render inline', () => {
  const _layout = async () => {
    const [Header, Content] = await Promise.all([
      renderServerComponent(<header>MARK_HEADER</header>),
      renderServerComponent(<Greeting name="MARK" />),
    ])
    return { Header, Content }
  }
  const { Header, Content } = null as unknown as Awaited<
    ReturnType<typeof _layout>
  >
  expectTypeOf(Header).toExtend<ReactNode>()
  expectTypeOf(Content).toExtend<ReactNode>()
  void (
    <>
      {Header}
      {Content}
    </>
  )
})

test('the result is not a composite source', () => {
  const _greeting = () => renderServerComponent(<Greeting name="MARK" />)
  const Renderable = null as unknown as Awaited<ReturnType<typeof _greeting>>
  // @ts-expect-error renderables take no slots: use createCompositeComponent
  void (<CompositeComponent src={Renderable} />)
})
