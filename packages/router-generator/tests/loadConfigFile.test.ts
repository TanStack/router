import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadConfigFile } from '../src/filesystem/virtual/loadConfigFile'

describe('loadConfigFile', () => {
  let tempDir: string | undefined

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  it('resolves tsconfig path aliases in config files', async () => {
    tempDir = await fs.mkdtemp(join(tmpdir(), 'router-generator-'))

    await fs.mkdir(join(tempDir, 'lib'), { recursive: true })
    await fs.writeFile(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@/*': ['./lib/*'],
          },
        },
      }),
    )
    await fs.writeFile(join(tempDir, 'lib/constants.ts'), 'export const id = 7275')
    await fs.writeFile(
      join(tempDir, 'routes.ts'),
      "import { id } from '@/constants'\nexport default id\n",
    )

    await expect(loadConfigFile(join(tempDir, 'routes.ts'))).resolves.toEqual({
      default: 7275,
    })
  })
})
