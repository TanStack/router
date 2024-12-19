import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { temporaryDirectoryTask } from 'tempy'
import { runCli } from '../../src/cli'

const constructCliArgs = ({
  template,
  directory,
  packageName,
  packageManager,
  installDeps,
  initGit,
  hideLogo,
  ide,
}: {
  template?: string
  directory?: string
  packageName?: string
  packageManager?: string
  installDeps?: boolean
  initGit?: boolean
  hideLogo?: boolean
  ide?: string
}) => {
  return [
    'node',
    'cli.js',
    '--template',
    template ?? 'barebones',
    '--directory',
    directory ?? '',
    '--package-name',
    packageName ?? '',
    '--package-manager',
    packageManager ?? 'npm',
    ...(installDeps === false ? ['--no-install-deps'] : []),
    ...(initGit === false ? ['--no-init-git'] : []),
    ...(hideLogo ? ['--hide-logo'] : []),
    ...(ide ? ['--ide', ide] : []),
  ]
}

describe('cli e2e', () => {
  it('should create a basic project structure using CLI', async () => {
    await temporaryDirectoryTask(async (tempDir) => {
      const args = constructCliArgs({
        template: 'barebones',
        directory: tempDir,
        packageName: 'test-package',
        packageManager: 'npm',
        installDeps: false,
        hideLogo: true,
        ide: 'vscode',
        initGit: false,
      })

      await runCli(args)

      // Check core files exist
      const expectedFiles = [
        '.gitignore',
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

  it('should create project in current directory when using "." as directory', async () => {
    await temporaryDirectoryTask(async (tempDir) => {
      const args = constructCliArgs({
        template: 'barebones',
        directory: '.',
        packageName: 'test-package',
        packageManager: 'npm',
        installDeps: false,
        hideLogo: true,
        ide: 'vscode',
        initGit: false,
      })

      // Run CLI from the temporary directory
      process.chdir(tempDir)
      await runCli(args)

      // Check core files exist in current directory
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

      // Reset working directory
      process.chdir('..')
    })
  })

  it('should fail when using an incorrect directory name', async () => {
    const args = constructCliArgs({
      template: 'barebones',
      directory: '/invalid/directory/path',
      packageName: 'test-package',
      packageManager: 'npm',
      installDeps: false,
      hideLogo: true,
      ide: 'vscode',
      initGit: false,
    })

    await expect(runCli(args)).rejects.toThrow()
  })
})
