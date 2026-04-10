#!/usr/bin/env node
/**
 * Build declarations for all packages using tsgo (TypeScript 7 native compiler).
 *
 * 1. Runs `tsgo --build` to generate .d.ts files in each package's dist/esm/
 * 2. Copies .d.ts → .d.cts in dist/cjs/ with import extensions rewritten
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

// Step 1: Run tsgo --build
console.time('tsgo --build')
try {
  execSync('node_modules/.bin/tsgo --build tsconfig.build-all.json --force --noCheck', {
    cwd: ROOT,
    stdio: 'inherit',
  })
} catch (e) {
  process.exit(1)
}
console.timeEnd('tsgo --build')

// Step 2: Copy .d.ts → .d.cts for CJS packages
console.time('copy .d.cts')

function rewriteExtensions(content) {
  // .js imports → .cjs
  content = content.replace(
    /(im|ex)port\s[\w{}/*\s,]+from\s['"](?:\.\.?\/)+?[^.'"]+(?=['"];?)/gm,
    '$&.cjs',
  )
  content = content.replace(
    /import\(['"](?:\.\.?\/)+?[^.'"]+(?=['"];?)/gm,
    '$&.cjs',
  )
  // Already has .js extension → replace with .cjs
  content = content.replace(/\.js(['"])/g, '.cjs$1')
  return content
}

function copyDtsToCjs(esmDir, cjsDir) {
  if (!fs.existsSync(esmDir)) return
  for (const entry of fs.readdirSync(esmDir, { withFileTypes: true })) {
    const srcPath = path.join(esmDir, entry.name)
    if (entry.isDirectory()) {
      copyDtsToCjs(srcPath, path.join(cjsDir, entry.name))
    } else if (entry.name.endsWith('.d.ts')) {
      const content = fs.readFileSync(srcPath, 'utf-8')
      const cjsContent = rewriteExtensions(content)
      const cjsFileName = entry.name.replace('.d.ts', '.d.cts')
      fs.mkdirSync(cjsDir, { recursive: true })
      fs.writeFileSync(path.join(cjsDir, cjsFileName), cjsContent)
    }
  }
}

// Find all packages with dist/esm that also have CJS output
const packagesDir = path.join(ROOT, 'packages')
for (const pkg of fs.readdirSync(packagesDir)) {
  const esmDir = path.join(packagesDir, pkg, 'dist', 'esm')
  const cjsDir = path.join(packagesDir, pkg, 'dist', 'cjs')
  if (fs.existsSync(esmDir)) {
    copyDtsToCjs(esmDir, cjsDir)
  }
}
console.timeEnd('copy .d.cts')
