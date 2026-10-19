import { expectTypeOf, test } from 'vitest'

import { CompositeComponent } from '../src/CompositeComponent'
import type { ComponentProps } from 'react'
import type { CompositeComponentResult } from '../src/ServerComponentTypes'

test('CompositeComponent infers slot props from src', () => {
  type Post = (props: {
    children?: React.ReactNode
    header: (title: string) => React.ReactNode
    footer: () => React.ReactNode
  }) => React.ReactNode

  type Src = CompositeComponentResult<Post>

  expectTypeOf(CompositeComponent).toBeFunction()

  type Props = ComponentProps<typeof CompositeComponent<Src>>

  // Type-level: ensure inferred props include slots
  type Expected = {
    src: Src
    children?: React.ReactNode
    header: (title: string) => React.ReactNode
    footer: () => React.ReactNode
  }

  expectTypeOf<Props>().branded.toEqualTypeOf<Expected>()
})
