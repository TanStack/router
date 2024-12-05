import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { barebonesTemplate } from '../../../src/templates/barebones'
import { temporaryDirectory, temporaryDirectoryTask } from 'tempy'
import { readFile, rm } from 'fs/promises'
import { join } from 'path'

describe('barebones template e2e', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = temporaryDirectory()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should create a basic project structure', async () => {
    await barebonesTemplate._execute({
      cfg: {
        name: 'test-project',
        packageManager: 'npm',
        installDeps: false,
        setupGit: false,
        ide: 'vscode',
      },
      targetPath: tempDir,
      type: 'new-project',
    })

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
