#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const packages = {
  './packages/react-router': [
    {
      paths: ['./docs/router/framework/react/api/router'],
      description: 'TanStack Router: API',
      name: 'api',
      globs: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    {
      paths: ['./docs/router/framework/react/guide'],
      description: 'TanStack Router: Guide',
      name: 'guide',
      globs: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    {
      paths: ['./docs/router/framework/react/routing'],
      description: 'TanStack Router: Routing',
      name: 'routing',
      globs: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    {
      paths: [
        './docs/router/framework/react/overview.md',
        './docs/router/framework/react/quick-start.md',
        './docs/router/framework/react/devtools.md',
        './docs/router/framework/react/migrate-from-react-router.md',
        './docs/router/framework/react/migrate-from-react-location.md',
        './docs/router/framework/react/faq.md',
      ],
      description: 'TanStack Router: Setup and Architecture',
      name: 'setup-and-architecture',
      globs: [
        'package.json',
        'vite.config.ts',
        'tsconfig.json',
        'src/**/*.ts',
        'src/**/*.tsx',
      ],
    },
  ],
}

function camelCase(str) {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function extractFrontMatter(content) {
  const frontMatterEndIndex = content.indexOf('---', 3) + 3
  const frontMatter = content.slice(0, frontMatterEndIndex)
  const bodyContent = content.slice(frontMatterEndIndex).trim()
  return { frontMatter, bodyContent }
}

function convertMarkdownToTypeScript(markdownContent) {
  const sanitizedContent = markdownContent
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
  return `const content = \`${sanitizedContent}\`;\n\nexport default content;\n`
}

function mergeFiles(files, outputFile) {
  let mergedContent = ''
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const { frontMatter, bodyContent } = extractFrontMatter(content)
    const title = frontMatter.match(/title:\s*(.+)/)[1].trim()
    mergedContent += `# ${title}\n\n${bodyContent}\n\n`
  }
  fs.writeFileSync(
    outputFile,
    convertMarkdownToTypeScript(mergedContent),
    'utf-8',
  )
}

for (const pkg of Object.keys(packages)) {
  const llmsDir = path.join(pkg, 'llms')
  const rulesDir = path.join(llmsDir, 'rules')
  if (!fs.existsSync(rulesDir)) {
    fs.mkdirSync(rulesDir, { recursive: true })
  }

  // Create the rules files
  const imports = []
  const rules = []
  for (const { paths, name, description, globs } of packages[pkg]) {
    const files = []
    for (const p of paths) {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        files.push(
          ...fs
            .readdirSync(p)
            .filter((file) => file.endsWith('.md'))
            .map((file) => path.join(p, file)),
        )
      } else {
        files.push(p)
      }
    }
    mergeFiles(files.flat(), path.join(rulesDir, `${name}.ts`))
    imports.push(`import ${camelCase(name)} from './rules/${name}.js'`)
    rules.push(`{
  name: '${name}',
  description: '${description}',
  rule: ${camelCase(name)},
  alwaysApply: false,
  globs: [${globs.map((glob) => `'${glob}'`).join(', ')}],
}`)
  }

  // Create the index.ts file
  const indexFile = path.join(llmsDir, 'index.ts')
  const indexContent = `${imports.join('\n')}

import type { PackageRuleItem } from 'vibe-rules'

const rules: Array<PackageRuleItem> = [
  ${rules.join(',\n')}
]

export default rules
`
  fs.writeFileSync(indexFile, indexContent, 'utf-8')

  fs.writeFileSync(
    path.join(llmsDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'bundler',
          target: 'ESNext',
          lib: ['ESNext', 'DOM'],
          declaration: true,
        },
        include: ['index.ts', 'rules/*.ts'],
        exclude: ['node_modules', 'dist'],
      },
      null,
      2,
    ),
    'utf-8',
  )
}
