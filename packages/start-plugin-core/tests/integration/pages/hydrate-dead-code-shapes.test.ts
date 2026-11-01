import { expect, test } from 'vitest'
import {
  deadCodeShapes,
  depSource,
  recordFile,
  shapeSetup,
} from '@tanstack/compiler-test-utils/dead-code-shapes'
import { expectRendersLikeSource, useHydrateHost } from '../../render'

// On the client `<Hydrate>` children move out of the parent module into
// split code the page loads on demand (SPEC J5.2). The move takes with it,
// in the parent, what only the children used, whatever the shape of the code
// in between (G16, J5.6): importing the parent does not load the module
// only the children import. Kept code keeps what it reads, and code already
// dead before the transform keeps running (G3). The server renders the
// children inline, like the uncompiled source, and the client hydrates it
// in a real page (`render.ts`). The same shapes run through every removal
// of the Start compiler in start-compiler-dead-code-shapes.test.ts.

const hosts = useHydrateHost()

for (const shape of deadCodeShapes) {
  test(`client: the parent drops what only the children use through ${shape.name}`, async () => {
    const kept = shape.kept
      ? `\nexport const kept = () => ${shape.kept.expression}
export { ${shape.kept.binding} as aliased }`
      : ''
    const recorded = shape.alreadyDead
      ? `\nexport { calls as recorded } from './record'`
      : ''
    const { client } = await expectRendersLikeSource(
      await hosts(),
      `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
${shapeSetup(shape, './dep')}
export function Page() {
  return <Hydrate when={load()}><p>{${shape.root}}</p></Hydrate>
}${kept}${recorded}`,
      {
        files: { 'dep.ts': depSource, ...recordFile },
        script: shape.kept
          ? 'return [m.kept(), m.aliased()]'
          : shape.alreadyDead
            ? 'return [...m.recorded]'
            : undefined,
      },
    )
    expect(client.html).toContain(`<p>${shape.expected}</p>`)
    if (shape.kept) {
      expect(client.result).toEqual([shape.kept.expected, 'dep'])
    } else {
      expect(client.loaded).not.toContain('./dep')
    }
    if (shape.alreadyDead) {
      expect(client.result).toContain('dead')
    }
  })
}
