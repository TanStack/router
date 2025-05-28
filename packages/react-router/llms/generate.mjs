#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

if (!fs.existsSync('./llms/rules')) {
  fs.mkdirSync('./llms/rules', { recursive: true })
}

function extractFrontMatter(content) {
  const frontMatterEndIndex = content.indexOf('---', 3) + 3
  const frontMatter = content.slice(0, frontMatterEndIndex)
  const bodyContent = content.slice(frontMatterEndIndex).trim()
  return { frontMatter, bodyContent }
}

function mergeFiles(files, outputFile) {
  let mergedContent = ''
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const { frontMatter, bodyContent } = extractFrontMatter(content)
    const title = frontMatter.match(/title:\s*(.+)/)[1].trim()
    mergedContent += `# ${title}\n\n${bodyContent}\n\n`
  }
  fs.writeFileSync(outputFile, mergedContent, 'utf-8')
}

const docs = {
  api: '../../docs/router/framework/react/api/router',
  guide: '../../docs/router/framework/react/guide',
  routing: '../../docs/router/framework/react/routing',
}

for (const key of Object.keys(docs)) {
  const files = fs.readdirSync(docs[key]).filter((file) => file.endsWith('.md'))
  mergeFiles(
    files.map((file) => path.join(docs[key], file)),
    `./packages/react-router/llms/rules/${key}.md`,
  )
}

mergeFiles(
  [
    '../../docs/router/framework/react/overview.md',
    '../../docs/router/framework/react/quick-start.md',
    '../../docs/router/framework/react/devtools.md',
    '../../docs/router/framework/react/migrate-from-react-router.md',
    '../../docs/router/framework/react/migrate-from-react-location.md',
    '../../docs/router/framework/react/faq.md',
  ],
  './llms/rules/setup-and-architecture.md',
)

function convertMarkdownToTypeScript(mdFilePath) {
  const content = fs.readFileSync(mdFilePath, 'utf-8')
  const sanitizedContent = content.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  const tsContent = `const content = \`${sanitizedContent}\`;\n\nexport default content;\n`
  const tsFilePath = mdFilePath.replace(/\.md$/, '.ts')
  fs.writeFileSync(tsFilePath, tsContent, 'utf-8')
}

const llmsDir = './llms/rules'
const mdFiles = fs.readdirSync(llmsDir).filter((file) => file.endsWith('.md'))

for (const mdFile of mdFiles) {
  convertMarkdownToTypeScript(path.join(llmsDir, mdFile))
}
