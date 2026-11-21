import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { createHmrFileEditor } from '../src/hmrFileEditor'

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'hmr-file-editor-'))
  const file = path.join(dir, 'route.tsx')
  await writeFile(file, "crumb: 'Child'\n")
  return { dir, file }
}

test('spaces successive writes of one file past the watcher change window', async () => {
  const { file } = await fixture()
  const editor = createHmrFileEditor({
    files: { route: file },
    minWriteIntervalMs: 100,
  })
  await editor.capturePromise

  const started = Date.now()
  await editor.replaceText('route', "'Child'", "'Child Updated'")
  const first = (await stat(file)).mtimeMs
  await editor.rewriteFile('route', (source) =>
    source.replace("'Child Updated'", "'Child Updated Again'"),
  )
  const second = (await stat(file)).mtimeMs

  expect(await readFile(file, 'utf8')).toBe("crumb: 'Child Updated Again'\n")
  expect(second - first).toBeGreaterThanOrEqual(95)
  expect(Date.now() - started).toBeLessThan(1000)
})

test('does not delay a first write or writes of different files', async () => {
  const { dir, file } = await fixture()
  const other = path.join(dir, 'other.tsx')
  await writeFile(other, 'other\n')
  const editor = createHmrFileEditor({
    files: { route: file, other },
    minWriteIntervalMs: 500,
  })
  await editor.capturePromise

  const started = Date.now()
  await editor.replaceText('route', "'Child'", "'Child Updated'")
  await editor.replaceText('other', 'other', 'other updated')
  expect(Date.now() - started).toBeLessThan(400)

  const restored = await editor.restoreFiles()
  expect(restored.sort()).toEqual(['other', 'route'])
  expect(Date.now() - started).toBeGreaterThanOrEqual(500)
  expect(await readFile(file, 'utf8')).toBe("crumb: 'Child'\n")
})
