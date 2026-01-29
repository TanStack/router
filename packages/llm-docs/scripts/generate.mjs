#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * LLM Docs Generator
 *
 * Generates a stripped-down, LLM-optimized documentation package from the
 * TanStack Router and Start docs. Outputs to dist/ with an auto-generated
 * AGENT.md routing file.
 *
 * Stripping operations (all regex/deterministic, no LLM):
 * - Removes YAML frontmatter (keeps title)
 * - Condenses duplicate code examples within sections
 * - Replaces full TypeScript interfaces with summaries
 * - Removes excessive whitespace
 * - Dedupes repeated warnings/notes
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Package root and repo root
const PACKAGE_ROOT = path.join(__dirname, '..')
const REPO_ROOT = path.join(PACKAGE_ROOT, '..', '..')
const DOCS_DIR = path.join(REPO_ROOT, 'docs')
const OUTPUT_DIR = path.join(PACKAGE_ROOT, 'dist')

// Source paths (React only)
const SOURCES = {
  router: path.join(DOCS_DIR, 'router', 'framework', 'react'),
  start: path.join(DOCS_DIR, 'start', 'framework', 'react'),
}

// Approximate tokens per character (rough estimate for English text + code)
const CHARS_PER_TOKEN = 4

/**
 * Extract title from YAML frontmatter
 */
function extractTitle(content) {
  const match = content.match(
    /^---\n[\s\S]*?title:\s*['"]?([^'"\n]+)['"]?[\s\S]*?\n---/,
  )
  return match ? match[1].trim() : null
}

/**
 * Remove YAML frontmatter, keeping just the title as an H1
 */
function stripFrontmatter(content) {
  const title = extractTitle(content)
  const stripped = content.replace(/^---\n[\s\S]*?\n---\n*/, '')

  // If content doesn't start with H1 and we have a title, add it
  if (title && !stripped.trim().startsWith('# ')) {
    return `# ${title}\n\n${stripped.trim()}`
  }
  return stripped.trim()
}

/**
 * Normalize code for comparison (strip variable names, extra whitespace)
 */
function normalizeCode(code) {
  return code
    .replace(/['"][^'"]*['"]/g, '""') // Normalize strings
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\b(const|let|var)\s+\w+/g, 'const x') // Normalize variable names
    .replace(/\$\w+/g, '$param') // Normalize route params
    .replace(/\/\w+/g, '/path') // Normalize paths
    .trim()
}

/**
 * Detect if code block is a "variation" example (similar structure, different values)
 */
function isVariationExample(code) {
  // Patterns that indicate "here's another way to do the same thing"
  const variationPatterns = [
    /<Link[^>]*to=/, // Multiple Link examples
    /params:\s*\{/, // Multiple params examples
    /search:\s*\{/, // Multiple search examples
    /navigate\s*\(\s*\{/, // Multiple navigate examples
  ]
  return variationPatterns.some((p) => p.test(code))
}

/**
 * Deduplicate similar code blocks within the same section
 * Much more aggressive - keeps only 1 example per pattern type
 */
function dedupeCodeBlocks(content) {
  const sections = content.split(/(?=^##\s)/m)

  return sections
    .map((section) => {
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
      const seenPatterns = new Map() // pattern type -> count
      const seenNormalized = new Map() // exact normalized -> seen

      return section.replace(codeBlockRegex, (match, lang, code) => {
        const normalized = normalizeCode(code)

        // Skip exact duplicates
        if (seenNormalized.has(normalized)) {
          return ''
        }
        seenNormalized.set(normalized, true)

        // For variation examples, only keep first one per section
        if (isVariationExample(code)) {
          const patternType =
            code.match(/<Link|useNavigate|navigate\(|params:|search:/)?.[0] ||
            'other'
          const count = seenPatterns.get(patternType) || 0
          seenPatterns.set(patternType, count + 1)

          if (count >= 1) {
            return '' // Remove variation
          }
        }

        return match
      })
    })
    .join('')
}

/**
 * Condense TypeScript interface/type definitions
 * Replaces full definitions with brief summaries
 */
function condenseInterfaces(content) {
  // Match interface or type definitions in code blocks (ts or tsx)
  const interfaceRegex = /```tsx?\n([\s\S]*?)```/g

  return content.replace(interfaceRegex, (match, code) => {
    // Check if this is a type/interface definition
    const typeMatch = code.match(/^(export\s+)?(interface|type)\s+(\w+)/m)
    if (!typeMatch) {
      return match // Not a type definition, keep as-is
    }

    const name = typeMatch[3]

    // Extract property names from the interface
    const propMatches = code.match(/^\s+(\w+)[\?:].*$/gm)
    const props = propMatches
      ? propMatches
          .map((p) => p.trim().split(/[\?:]/)[0].trim())
          .filter((p) => p && !p.startsWith('//'))
          .slice(0, 8) // Max 8 props
          .join(', ')
      : ''

    if (props) {
      const suffix = propMatches && propMatches.length > 8 ? ', ...' : ''
      return `\`${name}\`: { ${props}${suffix} } — See API reference for full definition.`
    }
    return `\`${name}\` — See API reference for full definition.`
  })
}

/**
 * Remove duplicate warnings/notes (keep first occurrence)
 */
function dedupeNotes(content) {
  const noteRegex =
    />\s*(\[!(?:TIP|WARNING|NOTE|IMPORTANT)\]|⚠️|🧠|💡)[\s\S]*?(?=\n\n|\n>|\n#|$)/g
  const seen = new Set()

  return content.replace(noteRegex, (match) => {
    // Create a normalized version for comparison
    const normalized = match.replace(/\s+/g, ' ').trim().slice(0, 100)
    if (seen.has(normalized)) {
      return ''
    }
    seen.add(normalized)
    return match
  })
}

/**
 * Clean up excessive whitespace
 */
function cleanWhitespace(content) {
  return content
    .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
    .replace(/```\n\n+/g, '```\n') // No blank lines after code fence start
    .replace(/\n\n+```/g, '\n```') // No excessive blank lines before code fence end
    .trim()
}

/**
 * Remove HTML comments
 */
function stripComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * Shorten long inline code explanations
 * e.g., "The `something` property does X and Y" stays
 * but repeated references to same code get shortened
 */
function shortenRepetitiveText(content) {
  // Remove "For example:" paragraphs that precede code blocks
  // (the code speaks for itself)
  return content
    .replace(/For example:?\s*\n+```/g, '\n```')
    .replace(/Here's an example:?\s*\n+```/g, '\n```')
    .replace(/Example:?\s*\n+```/g, '\n```')
    .replace(/Consider the following example:?\s*\n+```/g, '\n```')
}

/**
 * Main stripping function - applies all transformations
 */
function stripContent(content) {
  let result = content

  result = stripFrontmatter(result)
  result = stripComments(result)
  result = dedupeCodeBlocks(result)
  result = condenseInterfaces(result)
  result = dedupeNotes(result)
  result = shortenRepetitiveText(result)
  result = cleanWhitespace(result)

  return result
}

/**
 * Recursively get all markdown files in a directory
 */
function getMarkdownFiles(dir, baseDir = dir) {
  const files = []

  if (!fs.existsSync(dir)) {
    return files
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...getMarkdownFiles(fullPath, baseDir))
    } else if (entry.name.endsWith('.md')) {
      files.push({
        fullPath,
        relativePath: path.relative(baseDir, fullPath),
      })
    }
  }

  return files
}

/**
 * Process a single file: strip and return metadata
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const title = extractTitle(content) || path.basename(filePath, '.md')
  const stripped = stripContent(content)
  const originalSize = content.length
  const strippedSize = stripped.length
  const estimatedTokens = Math.ceil(strippedSize / CHARS_PER_TOKEN)

  return {
    title,
    content: stripped,
    originalSize,
    strippedSize,
    estimatedTokens,
    reduction: Math.round((1 - strippedSize / originalSize) * 100),
  }
}

/**
 * Generate the AGENT.md routing file
 */
function generateAgentMd(routerFiles, startFiles) {
  const formatTable = (files, product) => {
    if (files.length === 0) return ''

    // Group by directory
    const groups = {}
    for (const file of files) {
      const dir = path.dirname(file.relativePath)
      const group = dir === '.' ? 'General' : dir.split('/')[0]
      if (!groups[group]) groups[group] = []
      groups[group].push(file)
    }

    let table = ''
    for (const [group, groupFiles] of Object.entries(groups)) {
      table += `\n### ${group.charAt(0).toUpperCase() + group.slice(1)}\n\n`
      table += '| Topic | File | ~Tokens | Description |\n'
      table += '|-------|------|---------|-------------|\n'

      for (const file of groupFiles.sort((a, b) =>
        a.title.localeCompare(b.title),
      )) {
        const filePath = `${product}/${file.relativePath}`
        table += `| ${file.title} | \`${filePath}\` | ${file.estimatedTokens} | |\n`
      }
    }

    return table
  }

  const routerTotal = routerFiles.reduce((sum, f) => sum + f.estimatedTokens, 0)
  const startTotal = startFiles.reduce((sum, f) => sum + f.estimatedTokens, 0)

  return `# TanStack Router & Start - LLM Documentation

This is an auto-generated documentation package optimized for LLM consumption.
Files have been stripped of redundant examples and condensed for efficiency.

**Package:** \`@tanstack/llm-docs\`

## Quick Stats

- **Router Docs**: ${routerFiles.length} files, ~${routerTotal.toLocaleString()} tokens
- **Start Docs**: ${startFiles.length} files, ~${startTotal.toLocaleString()} tokens
- **Total**: ${routerFiles.length + startFiles.length} files, ~${(routerTotal + startTotal).toLocaleString()} tokens

## How to Use This Documentation

1. **Identify the topic** from the user's question
2. **Load the relevant file(s)** from the tables below
3. **Prefer smaller files** when multiple options exist
4. **Cross-reference** API docs when implementation details are needed

## Importing Files

\`\`\`javascript
// Import the AGENT.md router
import agent from '@tanstack/llm-docs'

// Import specific doc files
import navigation from '@tanstack/llm-docs/router/guide/navigation.md'
import serverFunctions from '@tanstack/llm-docs/start/guide/server-functions.md'
\`\`\`

## Routing Guide

### When to Load Router Docs
- Questions about client-side routing, navigation, links
- Questions about route definitions, path params, search params
- Questions about data loading with loaders
- Questions about route guards, authentication
- Questions about code splitting, lazy loading

### When to Load Start Docs
- Questions about server-side rendering (SSR)
- Questions about server functions, API routes
- Questions about full-stack features
- Questions about deployment, hosting
- Questions about file-based routing in Start

---

## TanStack Router (Client-Side Routing)
${formatTable(routerFiles, 'router')}

---

## TanStack Start (Full-Stack Framework)
${formatTable(startFiles, 'start')}

---

## Common Patterns

### Navigation
- Basic Link: \`router/guide/navigation.md\`
- Programmatic: \`router/guide/navigation.md\` (useNavigate section)
- Search params: \`router/guide/search-params.md\`

### Data Loading
- Route loaders: \`router/guide/data-loading.md\`
- External data (TanStack Query): \`router/guide/external-data-loading.md\`

### Route Definition
- File-based routes: \`router/routing/file-based-routing.md\`
- Code-based routes: \`router/routing/code-based-routing.md\`

### Server-Side (Start)
- Server functions: \`start/guide/server-functions.md\`
- SSR: \`start/guide/ssr.md\`

---

*Generated: ${new Date().toISOString()}*
`
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 LLM Docs Generator\n')

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true })
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const allFiles = { router: [], start: [] }
  let totalOriginal = 0
  let totalStripped = 0

  // Process each product
  for (const [product, sourceDir] of Object.entries(SOURCES)) {
    console.log(`📁 Processing ${product} docs...`)

    const outputProductDir = path.join(OUTPUT_DIR, product)
    const files = getMarkdownFiles(sourceDir)

    for (const file of files) {
      const result = processFile(file.fullPath)

      // Create output directory structure
      const outputPath = path.join(outputProductDir, file.relativePath)
      const outputDirPath = path.dirname(outputPath)

      if (!fs.existsSync(outputDirPath)) {
        fs.mkdirSync(outputDirPath, { recursive: true })
      }

      // Write stripped file
      fs.writeFileSync(outputPath, result.content, 'utf-8')

      // Track stats
      allFiles[product].push({
        ...result,
        relativePath: file.relativePath,
      })

      totalOriginal += result.originalSize
      totalStripped += result.strippedSize
    }

    console.log(`   ✓ ${files.length} files processed`)
  }

  // Generate AGENT.md
  console.log('\n📝 Generating AGENT.md...')
  const agentMd = generateAgentMd(allFiles.router, allFiles.start)
  fs.writeFileSync(path.join(OUTPUT_DIR, 'AGENT.md'), agentMd, 'utf-8')

  // Summary
  const reduction = Math.round((1 - totalStripped / totalOriginal) * 100)
  const totalFiles = allFiles.router.length + allFiles.start.length
  const totalTokens = Math.ceil(totalStripped / CHARS_PER_TOKEN)

  console.log('\n✅ Complete!\n')
  console.log('📊 Summary:')
  console.log(`   Files: ${totalFiles}`)
  console.log(`   Original: ${(totalOriginal / 1024).toFixed(1)} KB`)
  console.log(`   Stripped: ${(totalStripped / 1024).toFixed(1)} KB`)
  console.log(`   Reduction: ${reduction}%`)
  console.log(`   Est. Tokens: ~${totalTokens.toLocaleString()}`)
  console.log(`\n📂 Output: ${OUTPUT_DIR}`)
}

main().catch(console.error)
