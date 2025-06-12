import * as fs from 'node:fs'
import * as path from 'node:path'

function space(n = 1) {
  return ' '.repeat(n)
}

/**
 * Pairs of package labels and their corresponding paths
 * @typedef {[string, string]} LabelerPair
 */

/**
 * @returns {Array<LabelerPair>} Pairs of package labels and their corresponding paths
 */
function getPairs() {
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
        console.log(
          `Skipping \`${folder}\` as it does not have a \`package.json\` file.`,
        )
      }
    })

  // Sort by package name in alphabetical order
  pairs.sort((a, b) => a[0].localeCompare(b[0]))

  // Always add the docs folder
  pairs.push(['documentation', 'docs/**/*'])

  return pairs
}

/**
 * @param {Array<LabelerPair>} pairs
 * @returns {string} YAML string for the labeler config
 */
function generateLabelerYaml(pairs) {
  // Convert the pairs into valid yaml
  const str = pairs
    .map(([packageLabel, packagePath]) => {
      let result =
        `'${packageLabel}':` + '\n' + `${space(2)}-${space(1)}'${packagePath}'`
      return result
    })
    .join('\n')

  return str
}

function run() {
  // Generate the pairs of package labels and their corresponding paths
  const pairs = getPairs()

  // Convert the pairs into valid yaml
  const yamlStr = generateLabelerYaml(pairs)

  // Write to '.github/labeler.yml'
  const configPath = path.resolve('.github/labeler.yml')
  fs.writeFileSync(configPath, yamlStr + '\n', {
    encoding: 'utf-8',
  })
}

run()

process.exit(0)
