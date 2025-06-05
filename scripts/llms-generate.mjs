#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

/*
This script generates LLM rules in CJS and ESM formats in the dist/llms directory.

It takes a package name as an argument and generates the rules for that package.

We generate the files directly without compilation because we couldn't get TSC to generate the correct CJS format directly.
We have to generate both the ESM version and the CJS version because our publint requires that we support both formats,
even though the `vibe-rules` package only really supports CJS.
*/

const DOCS_DIR = '../../docs'

const LLMS_DIR = './dist/llms'
const ESM_DIR = './esm'
const CJS_DIR = './cjs'
const RULES_DIR = './rules'

const packages = {
  'react-router': [
    {
      paths: [`${DOCS_DIR}/router/framework/react/api/router`],
      description: 'TanStack Router: API',
      name: 'api',
      globs: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    {
      paths: [`${DOCS_DIR}/router/framework/react/guide`],
      description: 'TanStack Router: Guide',
      name: 'guide',
      globs: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    {
      paths: [`${DOCS_DIR}/router/framework/react/routing`],
      description: 'TanStack Router: Routing',
      name: 'routing',
      globs: ['src/**/*.ts', 'src/**/*.tsx'],
    },
    {
      paths: [
        `${DOCS_DIR}/router/framework/react/overview.md`,
        `${DOCS_DIR}/router/framework/react/quick-start.md`,
        `${DOCS_DIR}/router/framework/react/devtools.md`,
        `${DOCS_DIR}/router/framework/react/migrate-from-react-router.md`,
        `${DOCS_DIR}/router/framework/react/migrate-from-react-location.md`,
        `${DOCS_DIR}/router/framework/react/faq.md`,
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

const pkg = process.argv[2]
if (!pkg) {
  console.error('Usage: node scripts/llms-generate.mjs <package-name>')
  process.exit(1)
}
if (!packages[pkg]) {
  console.error(`Package '${pkg}' not found`)
  process.exit(1)
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

function sanitizeMarkdown(markdownContent) {
  return markdownContent.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

function convertMarkdownToTypeScriptESM(markdownContent) {
  return `export default \`${sanitizeMarkdown(markdownContent)}\`;`
}

function convertMarkdownToTypeScriptCJS(markdownContent) {
  return `module.exports = \`${sanitizeMarkdown(markdownContent)}\`;`
}

function mergeFiles(files, outputFile, esm = true) {
  let mergedContent = ''
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const { frontMatter, bodyContent } = extractFrontMatter(content)
    const title = frontMatter.match(/title:\s*(.+)/)[1].trim()
    mergedContent += `# ${title}\n\n${bodyContent}\n\n`
  }
  fs.writeFileSync(
    outputFile,
    esm
      ? convertMarkdownToTypeScriptESM(mergedContent)
      : convertMarkdownToTypeScriptCJS(mergedContent),
    'utf-8',
  )
}

if (!fs.existsSync(path.join(LLMS_DIR, ESM_DIR, RULES_DIR))) {
  fs.mkdirSync(path.join(LLMS_DIR, ESM_DIR, RULES_DIR), { recursive: true })
}
if (!fs.existsSync(path.join(LLMS_DIR, CJS_DIR, RULES_DIR))) {
  fs.mkdirSync(path.join(LLMS_DIR, CJS_DIR, RULES_DIR), { recursive: true })
}

// Create the rules files
const esm_imports = []
const cjs_imports = []
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

  // Create the ESM rule files
  mergeFiles(
    files.flat(),
    path.join(LLMS_DIR, ESM_DIR, RULES_DIR, `${name}.js`),
    true,
  )

  // Create the CJS rule files
  mergeFiles(
    files.flat(),
    path.join(LLMS_DIR, CJS_DIR, RULES_DIR, `${name}.cjs`),
    false,
  )
  fs.writeFileSync(
    path.join(LLMS_DIR, CJS_DIR, RULES_DIR, `${name}.d.cts`),
    '',
    'utf-8',
  )

  esm_imports.push(`import ${camelCase(name)} from './rules/${name}.js'`)
  cjs_imports.push(`const ${camelCase(name)} = require('./rules/${name}.cjs')`)
  rules.push(`{
  name: '${name}',
  description: '${description}',
  rule: ${camelCase(name)},
  alwaysApply: false,
  globs: [${globs.map((glob) => `'${glob}'`).join(', ')}],
}`)
}

// Create the ESM index.js file
const indexFile = path.join(LLMS_DIR, ESM_DIR, 'index.js')
const esm_indexContent = `${esm_imports.join('\n')}

const rules = [
  ${rules.join(',\n')}
]

export default rules
`
fs.writeFileSync(indexFile, esm_indexContent, 'utf-8')

// Create the ESM index.d.cts file
const esm_dtsFile = path.join(LLMS_DIR, ESM_DIR, 'index.d.ts')
const esm_dtsContent = `import type { PackageRuleItem } from 'vibe-rules';
declare const rules: Array<PackageRuleItem>;
export default rules;`
fs.writeFileSync(esm_dtsFile, esm_dtsContent, 'utf-8')

// Create the CJS index.cjs file
const cjs_indexContent = `${cjs_imports.join('\n')}

const rules = [
  ${rules.join(',\n')}
]

module.exports = rules
`
fs.writeFileSync(
  path.join(LLMS_DIR, CJS_DIR, 'index.cjs'),
  cjs_indexContent,
  'utf-8',
)
fs.writeFileSync(path.join(LLMS_DIR, CJS_DIR, 'index.d.cts'), '{}', 'utf-8')
