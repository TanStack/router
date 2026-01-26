#!/usr/bin/env node

import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_SOURCE = resolve(__dirname, '..', 'skills', 'tanstack-router')
const DEFAULT_DEST = '.ai/tanstack-router'

function printHelp() {
  console.log(`
Usage: npx @tanstack/router-skills init [destination]

Downloads TanStack Router skills to a local directory for use with AI tools.

Arguments:
  destination    Target directory (default: ${DEFAULT_DEST})

Examples:
  npx @tanstack/router-skills init
  npx @tanstack/router-skills init .cursor/rules/tanstack
  npx @tanstack/router-skills init .ai/skills/tanstack-router
`)
}

function countFiles(dir, ext = '.md') {
  let count = 0
  const items = readdirSync(dir)
  for (const item of items) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      count += countFiles(fullPath, ext)
    } else if (item.endsWith(ext)) {
      count++
    }
  }
  return count
}

function copySkills(dest) {
  const destination = resolve(process.cwd(), dest)

  // Create destination directory
  if (!existsSync(destination)) {
    mkdirSync(destination, { recursive: true })
  }

  // Copy skills, excluding GENERATION.md
  cpSync(SKILLS_SOURCE, destination, {
    recursive: true,
    filter: (src) => !src.endsWith('GENERATION.md'),
  })

  const fileCount = countFiles(destination)
  console.log(`\nTanStack Router skills installed to: ${destination}`)
  console.log(`Copied ${fileCount} skill files.\n`)
  console.log(
    "Add this directory to your AI tool's context/rules configuration.",
  )
}

// Main
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  printHelp()
  process.exit(0)
}

const command = args[0]

if (!command || command === 'init') {
  const dest = args[1] || DEFAULT_DEST
  copySkills(dest)
} else if (command && !command.startsWith('-')) {
  // Treat as destination path for convenience
  copySkills(command)
} else {
  printHelp()
  process.exit(1)
}
