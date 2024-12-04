import invariant from 'tiny-invariant'
import { helperFactory } from './helperFactory'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

export const createReadTargetFile = helperFactory(
  ({ ctx, modulePath, targetPath }) =>
    async (relativePath: string) => {
      invariant(
        await ctx.targetFileExists(relativePath),
        `The file ${relativePath} doesn't exist`,
      )
      const path = resolve(targetPath, relativePath)
      return await readFile(path, 'utf-8')
    },
)
