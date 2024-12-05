import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { temporaryDirectory } from 'tempy'
import { readFile, rm } from 'fs/promises'
import { join } from 'path'
import { runCli } from '../../src/cli'

describe('cli e2e', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = temporaryDirectory()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should create a basic project structure using CLI', async () => {
    const args = [
      'node', // First arg is node
      'cli.js', // Second arg is script name
      '--template',
      'barebones',
      '--directory',
      tempDir,
      '--package-name',
      'test-project',
      '--package-manager',
      'npm',
      '--no-install-deps',
      '--no-init-git',
      '--hide-logo',
      '--ide',
      'vscode',
    ]

    await runCli(args)

    // Check core files exist
    const expectedFiles = [
      'package.json',
      'tsconfig.json',
      'app.config.ts',
      'app/client.tsx',
      'app/router.tsx',
      'app/routes/__root.tsx',
      'app/routes/index.tsx',
      '.vscode/settings.json',
    ]

    for (const file of expectedFiles) {
      const filePath = join(tempDir, file)
      const exists = await readFile(filePath)
      expect(exists).toBeDefined()
    }
  })
})
