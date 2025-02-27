import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { temporaryDirectoryTask } from 'tempy'
import { barebonesTemplate } from '../../../src/templates/barebones'

const base = (tmpDir: string) => ({
  cfg: {
    packageManager: {
      installDeps: false,
      packageManager: 'npm' as const,
    },
    git: {
      setupGit: false,
    },
    packageJson: {
      type: 'new' as const,
      name: 'test',
    },
    ide: {
      ide: 'vscode' as const,
    },
  },
  targetPath: tmpDir,
  type: 'new-project' as const,
})

describe('barebones template e2e', () => {
  it('should create a basic project structure', async () => {
    await temporaryDirectoryTask(async (tempDir) => {
      await barebonesTemplate.execute(base(tempDir))

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

  it('should have valid package.json contents', async () => {
    await temporaryDirectoryTask(async (tempDir) => {
      await barebonesTemplate.execute(base(tempDir))

      const pkgJsonPath = join(tempDir, 'package.json')
      const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'))

      expect(pkgJson.name).toBe('test')
      expect(pkgJson.private).toBe(true)
      expect(pkgJson.type).toBe('module')
      expect(pkgJson.dependencies).toBeDefined()
      expect(pkgJson.dependencies['@tanstack/react-router']).toBeDefined()
      expect(pkgJson.dependencies['@tanstack/react-start']).toBeDefined()
      expect(pkgJson.dependencies['react']).toBeDefined()
      expect(pkgJson.dependencies['react-dom']).toBeDefined()
      expect(pkgJson.dependencies['vite']).toBeDefined()

      expect(pkgJson.devDependencies).toBeDefined()
      expect(pkgJson.devDependencies['@types/react']).toBeDefined()

      expect(pkgJson.scripts).toBeDefined()
      expect(pkgJson.scripts.dev).toBe('vite dev')
      expect(pkgJson.scripts.build).toBe('vite build')
      expect(pkgJson.scripts.start).toBe('vite start')
    })
  })
})
