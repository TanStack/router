import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import invariant from 'tiny-invariant'
import { helperFactory } from './helperFactory'

export const createReadTargetFile = helperFactory(
  ({ ctx, targetPath }) =>
    async (relativePath: string) => {
      invariant(
        await ctx.targetFileExists(relativePath),
        `The file ${relativePath} doesn't exist`,
      )
      const path = resolve(targetPath, relativePath)
      return await readFile(path, 'utf-8')
    },
)
