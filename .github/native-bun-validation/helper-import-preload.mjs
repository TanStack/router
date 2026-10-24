import { mock } from 'bun:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
const repository = fileURLToPath(new URL('../../../', import.meta.url))
const candidateEntry = process.env.JITI_CANDIDATE_ENTRY
  ? path.resolve(process.env.JITI_CANDIDATE_ENTRY)
  : path.join(
      repository,
      '.cache/jiti-helper-investigation/upstream/lib/jiti.mjs',
    )
const candidate = await import(pathToFileURL(candidateEntry).href)
mock.module('jiti', () => candidate)
process.env.JITI_COMBINED_MODE = 'candidate'
