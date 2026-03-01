import * as fs from 'node:fs'
import * as path from 'node:path'
import { format as formatWithOxfmt } from 'oxfmt'
import type { FormatOptions } from 'oxfmt'

/** Pairs of package labels and their corresponding paths */
type LabelerPair = [string, string]

const oxfmtConfigPath = path.resolve('.oxfmtrc.json')

function readOxfmtConfig(): FormatOptions {
  if (!fs.existsSync(oxfmtConfigPath)) {
    throw new Error(`No Oxfmt config file found at \`${oxfmtConfigPath}\`.`)
  }

  const rawConfig = fs.readFileSync(oxfmtConfigPath, 'utf-8')
  const parsedConfig = JSON.parse(rawConfig) as {
    $schema?: string
  } & FormatOptions
  const { $schema: _schema, ...formatOptions } = parsedConfig

  return formatOptions
}

function readPairsFromFs(): Array<LabelerPair> {
  const ignored = new Set(['.DS_Store'])

  const pairs: Array<LabelerPair> = []

  // Add subfolders in the packages folder, i.e. packages/**
  fs.readdirSync(path.resolve('packages'))
    .filter((folder) => !ignored.has(folder))
    .forEach((folder) => {
      // Check if package.json exists for the folder before adding it
      if (
        fs.existsSync(
          path.resolve(path.join('packages', folder, 'package.json')),
        )
      ) {
        pairs.push([`package: ${folder}`, `packages/${folder}/**/*`])
      } else {
        console.info(
          `Skipping \`${folder}\` as it does not have a \`package.json\` file.`,
        )
      }
    })

  // Sort by package name in alphabetical order
  pairs.sort((a, b) => a[0].localeCompare(b[0]))

  return pairs
}

async function generateLabelerYaml(pairs: Array<LabelerPair>): Promise<string> {
  function s(n = 1) {
    return ' '.repeat(n)
  }

  // Convert the pairs into valid yaml
  const formattedPairs = pairs
    .map(([packageLabel, packagePath]) => {
      const result = [
        `'${packageLabel}':`,
        `${s(2)}-${s(1)}changed-files:`,
        `${s(4)}-${s(1)}any-glob-to-any-file:${s(1)}'${packagePath}'`,
      ].join('\n')

      return result
    })
    .join('\n')

  const oxfmtConfig = readOxfmtConfig()

  // Format the YAML string using Oxfmt
  const formatResult = await formatWithOxfmt(
    'labeler-config.yml',
    formattedPairs,
    oxfmtConfig,
  )

  if (formatResult.errors.length > 0) {
    throw new Error(
      `Failed to format labeler config: ${formatResult.errors
        .map((error) => error.message)
        .join(', ')}`,
    )
  }

  return formatResult.code
}

async function run() {
  console.info('Generating labeler config...')

  // Generate the pairs of package labels and their corresponding paths
  const pairs = readPairsFromFs()

  // Always add the docs folder
  pairs.push(['documentation', 'docs/**/*'])

  // Convert the pairs into valid yaml
  const yamlStr = await generateLabelerYaml(pairs)

  // Write to 'labeler-config.yml'
  const configPath = path.resolve('labeler-config.yml')
  fs.writeFileSync(configPath, yamlStr, {
    encoding: 'utf-8',
  })

  console.info(`Generated labeler config at \`${configPath}\`!`)
  return
}

try {
  run().then(() => {
    process.exit(0)
  })
} catch (error) {
  console.error('Error generating labeler config:', error)
  process.exit(1)
}
