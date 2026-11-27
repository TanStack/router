import { expectTypeOf, test } from 'vitest'
import type { ReactElement } from 'react'

import { renderServerComponent } from '../src/renderServerComponent.stub'

test('renderServerComponent infers nested access type', () => {
  const element = null as unknown as { foo: { bar: ReactElement } }

  const dataPromise = renderServerComponent(element)

  type Data = Awaited<typeof dataPromise>

  // nested selection
  expectTypeOf<Data>().toHaveProperty('foo')
  expectTypeOf<Data['foo']>().toHaveProperty('bar')

  // also: each selected node is directly renderable
  expectTypeOf<Data['foo']['bar']>().toExtend<ReactElement>()
})
