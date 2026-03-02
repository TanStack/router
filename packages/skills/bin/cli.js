#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  cpSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PATHS = Object.freeze({
  SKILLS_SOURCE: resolve(__dirname, '..', 'skills', 'tanstack-router'),
  AGENT_TEMPLATE_SOURCE: resolve(
    __dirname,
    '..',
    'agents',
    'tanstack-router.agent.md',
  ),
  DEFAULT_SKILLS_DEST: '.agents/skills/tanstack-router',
  DEFAULT_SKILLS_FILE: '.agents/skills/registry.txt',
  DEFAULT_AGENT_FILE: '.agents/agent',
})

const DEFAULTS = Object.freeze({
  SKILLS_FILE: PATHS.DEFAULT_SKILLS_FILE,
  AGENT_FILE: PATHS.DEFAULT_AGENT_FILE,
  SKILLS_DEST: PATHS.DEFAULT_SKILLS_DEST,
})

class CliError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.name = 'CliError'
    this.code = code
  }
}

class FileSystem {
  static exists(path) {
    return existsSync(path)
  }

  static isDirectory(path) {
    return statSync(path).isDirectory()
  }

  static ensureDir(path) {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }
  }

  static readFile(path) {
    return readFileSync(path, 'utf8')
  }

  static writeFile(path, content) {
    writeFileSync(path, content, 'utf8')
  }

  static copyDir(src, dest, filter) {
    cpSync(src, dest, { recursive: true, filter })
  }

  static countFiles(dir, ext = '.md') {
    let count = 0
    const items = readdirSync(dir)
    for (const item of items) {
      const fullPath = join(dir, item)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        count += this.countFiles(fullPath, ext)
      } else if (item.endsWith(ext)) {
        count++
      }
    }
    return count
  }
}

function resolveFromCwd(path) {
  return resolve(process.cwd(), path)
}

const SkillsInstaller = {
  install(dest) {
    const destinationAbs = resolveFromCwd(dest)
    FileSystem.ensureDir(destinationAbs)

    FileSystem.copyDir(PATHS.SKILLS_SOURCE, destinationAbs, (src) => {
      return !src.endsWith('GENERATION.md')
    })

    const fileCount = FileSystem.countFiles(destinationAbs)
    return { destinationAbs, fileCount }
  },

  register(skillsFile, skillsPath) {
    const skillsFileAbs = resolveFromCwd(skillsFile)
    FileSystem.ensureDir(dirname(skillsFileAbs))

    if (
      FileSystem.exists(skillsFileAbs) &&
      FileSystem.isDirectory(skillsFileAbs)
    ) {
      throw new CliError(
        `Skills registry path is a directory: ${skillsFileAbs}\n` +
          `Choose a file path (eg .agents/skills/registry.txt) via --skills-file.`,
      )
    }

    const normalizedPath = skillsPath.trim().replace(/[\\/]+$/g, '')
    const existing = FileSystem.exists(skillsFileAbs)
      ? FileSystem.readFile(skillsFileAbs)
      : ''

    const entries = new Set(
      existing
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith('#'))
        .map((line) => line.trim().replace(/[\\/]+$/g, '')),
    )

    if (entries.has(normalizedPath)) {
      return { changed: false, skillsFileAbs }
    }

    let next = existing
    if (next && !next.endsWith('\n')) {
      next += '\n'
    }
    next += `${skillsPath}\n`
    FileSystem.writeFile(skillsFileAbs, next)

    return { changed: true, skillsFileAbs }
  },
}

const AgentInstaller = {
  install(agentFile, force = false) {
    const agentFileAbs = resolveFromCwd(agentFile)
    FileSystem.ensureDir(dirname(agentFileAbs))

    if (FileSystem.exists(agentFileAbs) && !force) {
      const err = new CliError(
        `Agent file already exists at: ${agentFileAbs}\nRe-run with --force to overwrite.`,
      )
      err.code = 'EEXIST'
      throw err
    }

    FileSystem.copyDir(PATHS.AGENT_TEMPLATE_SOURCE, agentFileAbs)
    return { agentFileAbs }
  },
}

const ArgsParser = {
  parse(argv) {
    const out = {
      help: false,
      dest: undefined,
      skillsFile: DEFAULTS.SKILLS_FILE,
      register: undefined,
      agents: false,
      agentFile: DEFAULTS.AGENT_FILE,
      force: false,
      positionals: [],
    }

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]

      if (arg === '--help' || arg === '-h') {
        out.help = true
        continue
      }

      if (!arg.startsWith('-')) {
        out.positionals.push(arg)
        continue
      }

      const [flag, inlineValue] = arg.split('=', 2)
      const takeValue = () => {
        if (inlineValue != null) return inlineValue
        const next = argv[i + 1]
        if (next == null) throw new CliError(`Missing value for ${flag}`)
        return next
      }

      switch (flag) {
        case '--dest':
          out.dest = takeValue()
          break
        case '--skills-file':
          out.skillsFile = takeValue()
          break
        case '--register':
          out.register = true
          break
        case '--no-register':
          out.register = false
          break
        case '--agents':
          out.agents = true
          break
        case '--no-agents':
          out.agents = false
          break
        case '--agent-file':
          out.agentFile = takeValue()
          break
        case '--force':
          out.force = true
          break
        default:
          throw new CliError(`Unknown option: ${flag}`)
      }
    }

    return out
  },
}

function printHelp() {
  console.log(`
Usage: npx @tanstack/router-skills init [destination] [options]

Installs TanStack Router skills to a local directory for use with AI tools.

Default behavior:
  - Copies skills to: ${PATHS.DEFAULT_SKILLS_DEST}
  - Registers that path in: ${PATHS.DEFAULT_SKILLS_FILE}

Arguments:
  destination                      Copy skills to this directory (copy-only by default)

Options:
  --dest <path>                    Copy skills to this directory
  --skills-file <path>             Path to skills registry file (default: ${PATHS.DEFAULT_SKILLS_FILE})
  --register                       Register destination in the skills registry file
  --no-register                    Do not register destination (default when destination is provided)
  --agents                         Also install the TanStack Router agent template
  --no-agents                      Do not install the agent template
  --agent-file <path>              Path to agent file (default: ${PATHS.DEFAULT_AGENT_FILE})
  --force                          Overwrite ${PATHS.DEFAULT_AGENT_FILE} (or --agent-file)
  -h, --help                       Show this help

Examples:
  npx @tanstack/router-skills init
  npx @tanstack/router-skills init --agents
  npx @tanstack/router-skills init .cursor/rules/tanstack
  npx @tanstack/router-skills init .ai/skills/tanstack-router --register
`)
}

function resolveDestination(parsed) {
  const positionals = parsed.positionals
  const command = positionals[0]

  let destFromPos
  if (!command) {
    destFromPos = undefined
  } else if (command === 'init') {
    destFromPos = positionals[1]
    if (positionals.length > 2) throw new CliError('Too many arguments')
  } else {
    destFromPos = command
    if (positionals.length > 1) throw new CliError('Too many arguments')
  }

  if (parsed.dest && destFromPos) {
    throw new CliError('Destination provided twice (positional and --dest)')
  }

  const dest = parsed.dest ?? destFromPos ?? DEFAULTS.SKILLS_DEST
  const register =
    parsed.register ?? (parsed.dest == null && destFromPos == null)

  return { dest, register }
}

async function run(args) {
  const parsed = ArgsParser.parse(args)

  if (parsed.help) {
    printHelp()
    process.exit(0)
  }

  const { dest, register } = resolveDestination(parsed)

  const { destinationAbs, fileCount } = SkillsInstaller.install(dest)
  console.log(`\nTanStack Router skills installed to: ${destinationAbs}`)
  console.log(`Copied ${fileCount} skill files.`)

  if (register) {
    const { changed, skillsFileAbs } = SkillsInstaller.register(
      parsed.skillsFile,
      dest,
    )
    console.log(
      `${changed ? 'Registered' : 'Already registered'} skills path in: ${skillsFileAbs}`,
    )
  } else {
    console.log(
      'To enable automatic discovery, register this path in your AI tool, or run again with --register.',
    )
  }

  if (parsed.agents) {
    const { agentFileAbs } = AgentInstaller.install(
      parsed.agentFile,
      parsed.force,
    )
    console.log(`Installed agent template to: ${agentFileAbs}`)
  }

  console.log('')
}

run(process.argv.slice(2)).catch((err) => {
  const code = err.code ?? 1
  console.error(`\nError: ${err.message}\n`)
  printHelp()
  process.exit(code)
})
