#!/usr/bin/env node
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const [, , entrypointArg, sourcemapDirArg] = process.argv

if (!entrypointArg || !sourcemapDirArg) {
  console.error(
    'Usage: node benchmarks/memory/run-flame.mjs <entrypoint> <sourcemap-dir>',
  )
  process.exit(1)
}

const entrypointPath = path.resolve(entrypointArg)
const sourcemapDirPath = path.resolve(sourcemapDirArg)

if (!fs.existsSync(entrypointPath)) {
  console.error(`Flame entrypoint not found: ${entrypointPath}`)
  process.exit(1)
}

if (!fs.existsSync(sourcemapDirPath)) {
  console.error(`Flame sourcemap directory not found: ${sourcemapDirPath}`)
  process.exit(1)
}

const profileDir = path.join(
  path.dirname(entrypointPath),
  '.profiles',
  new Date().toISOString().replace(/[:.]/g, '-'),
)

fs.mkdirSync(profileDir, { recursive: true })

const entrypointRequire = createRequire(entrypointPath)
const { generateFlamegraph, generateMarkdown, startProfiling } =
  entrypointRequire('@platformatic/flame')

process.env.NODE_ENV = 'production'
process.env.TSR_MEMORY_FLAME = '1'

console.log(`Flame profile directory: ${profileDir}`)

const { pid, process: childProcess } = startProfiling(entrypointPath, [], {
  autoStart: false,
  cwd: profileDir,
  mdFormat: 'detailed',
  sourcemapDirs: [sourcemapDirPath],
})

console.log(`Flame profiling process: ${pid}`)

const childCode = await new Promise((resolve) => {
  childProcess.on('error', (error) => {
    console.error(`Failed to start Flame profiled process: ${error.message}`)
    resolve(1)
  })

  childProcess.on('close', (code, signal) => {
    if (signal) {
      console.error(`Flame profiled process exited via signal ${signal}`)
      resolve(1)
      return
    }

    resolve(code ?? 0)
  })
})

const heapProfilePaths = fs
  .readdirSync(profileDir)
  .filter((fileName) => /^heap-profile-.*\.pb$/.test(fileName))
  .sort()
  .map((fileName) => path.join(profileDir, fileName))

for (const heapProfilePath of heapProfilePaths) {
  const htmlPath = heapProfilePath.replace(/\.pb$/, '.html')
  const mdPath = heapProfilePath.replace(/\.pb$/, '.md')

  console.log(`Generating heap flamegraph: ${htmlPath}`)
  try {
    await generateFlamegraph(heapProfilePath, htmlPath)
  } catch (error) {
    console.warn(`Failed to generate heap flamegraph: ${error.message}`)
  }

  console.log(`Generating heap markdown: ${mdPath}`)
  try {
    await generateMarkdown(heapProfilePath, mdPath, { format: 'detailed' })
  } catch (error) {
    console.warn(`Failed to generate heap markdown: ${error.message}`)
  }
}

const heapReportPaths = fs
  .readdirSync(profileDir)
  .filter((fileName) => /^heap-profile-.*\.(?:html|md)$/.test(fileName))
  .sort()
  .map((fileName) => path.join(profileDir, fileName))

if (heapReportPaths.length > 0) {
  console.log('Generated heap profile reports:')
  for (const heapReportPath of heapReportPaths) {
    console.log(`  ${heapReportPath}`)
  }
}

process.exit(childCode)
