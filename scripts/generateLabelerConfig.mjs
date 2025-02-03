import * as fs from 'node:fs'
import * as path from 'node:path'

function generateLabelerConfig() {
  const ignored = ['.DS_Store']

  /**
   * Pairs of package labels and their corresponding paths
   * @type {Array<[string, string]>}
   **/
  const pairs = []

  // Add subfolders in the packages folder, i.e. packages/**
  fs.readdirSync(path.resolve('packages'))
    .filter((folder) => !ignored.includes(folder))
    .forEach((folder) => {
      pairs.push([`package: ${folder}`, `packages/${folder}/**/*`])
    })

  // Always add the docs folder
  pairs.push(['documentation', 'docs/**/*'])

  // Convert the pairs into valid yaml
  const labelerConfigYamlStr = pairs
    .map(([packageLabel, packagePath]) => {
      let result = `'${packageLabel}':` + '\n' + `  - '${packagePath}'`
      return result
    })
    .join('\n')

  // Write to '.github/labeler.yml'
  const labelerConfigPath = path.resolve('.github/labeler.yml')
  fs.writeFileSync(labelerConfigPath, labelerConfigYamlStr + '\n', {
    encoding: 'utf-8',
  })
}

generateLabelerConfig()

process.exit(0)
