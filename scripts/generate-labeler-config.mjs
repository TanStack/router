import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Pairs of package labels and their corresponding paths
 * @typedef {[string, string]} LabelerPair
 */

/**
 * @returns {Array<LabelerPair>} Pairs of package labels and their corresponding paths
 */
function readPairsFromFs() {
  const ignored = new Set(['.DS_Store'])

  /** @type {Array<LabelerPair>} */
  const pairs = []

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

/**
 * @param {Array<LabelerPair>} pairs
 * @returns {string} YAML string for the labeler config
 */
function generateLabelerYaml(pairs) {
  function s(n = 1) {
    return ' '.repeat(n)
  }

  // Convert the pairs into valid yaml
  const str = pairs
    .map(([packageLabel, packagePath]) => {
      const result = [
        `'${packageLabel}':`,
        `${s(2)}-${s(1)}changed-files:`,
        `${s(4)}-${s(1)}any-glob-to-any-file:${s(1)}'${packagePath}'`,
      ].join('\n')

      return result
    })
    .join('\n')

  return str
}

function run() {
  // Generate the pairs of package labels and their corresponding paths
  const pairs = readPairsFromFs()

  // Always add the docs folder
  pairs.push(['documentation', 'docs/**/*'])

  // Convert the pairs into valid yaml
  const yamlStr = generateLabelerYaml(pairs)

  // Write to '.github/labeler.yml'
  const configPath = path.resolve('.github/labeler.yml')
  fs.writeFileSync(configPath, yamlStr + '\n', {
    encoding: 'utf-8',
  })
  console.info(`Generated labeler config at \`${configPath}\`!`)
}

run()

process.exit(0)
