/**
 * Composes every page that takes another page by `ref:` (e.g. a Solid guide
 * from its React twin) the way tanstack.com does, and checks the result.
 *
 * The site (tanstack.com `src/utils/documents.server.ts`, `replaceContent`
 * and `replaceSections`) reads the referenced page, applies each `replace`
 * key as a global regular expression (`new RegExp(key, 'g')`), then swaps
 * each named section (`[//]: # 'Name'` ... `[//]: # 'Name'`) for the
 * referencing page's section of that name, and removes the markers. The two
 * steps below follow that code; keep them in step with it.
 *
 * Checks, for every page:
 * - a `replace` key is a valid regular expression that matches no empty
 *   string (the site would insert the replacement at every position);
 * - sections pair up, in both pages, and every section of the page exists in
 *   the referenced page (the site drops it silently otherwise);
 * - the composed page stays within twice the size of the two sources;
 * - the page's own expectations (`expectations` below).
 */
import { existsSync, readFileSync } from 'node:fs'
import { glob } from 'tinyglobby'
import { parse as parseYaml } from 'yaml'

interface Page {
  data: { ref?: unknown; replace?: unknown }
  content: string
}

/**
 * What a composed page must (`present`) and must not (`absent`) contain:
 * wording of the referenced page that the page replaces.
 */
const expectations: Record<
  string,
  { present: Array<string>; absent: Array<RegExp> }
> = {
  'docs/start/framework/solid/guide/deferred-hydration.md': {
    present: [
      '## Comparison To Solid Streaming Hydration',
      '## Nested Boundaries',
      '## Extraction Limits',
      '| A nested boundary assigning, through `ref`, a local declared outside both boundaries',
    ],
    absent: [/React/, /useRef/, /useCallback/, /useThing/, /\[\/\/\]: #/],
  },
}

const sectionMarker = /\[\/\/\]: # '([a-zA-Z\d]*)'/g
const section =
  /\[\/\/\]: # '([a-zA-Z\d]*)'[\S\s]*?\[\/\/\]: # '([a-zA-Z\d]*)'/g

/** The site's front matter split (`parseFrontMatter`). */
function parsePage(text: string): Page {
  const normalized = text.replace(/^﻿/, '')
  if (!normalized.startsWith('---')) {
    return { data: {}, content: text }
  }
  const lines = normalized.split(/\r?\n/)
  const closing = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (closing === -1) {
    return { data: {}, content: text }
  }
  return {
    data: parseYaml(lines.slice(1, closing).join('\n')) ?? {},
    content: lines.slice(closing + 1).join('\n'),
  }
}

/** The named sections of `text`, by name; unpaired markers go to `errors`. */
function sectionsOf(text: string, where: string, errors: Array<string>) {
  const found = new Map<string, RegExpMatchArray>()
  if ([...text.matchAll(sectionMarker)].length % 2 === 1) {
    errors.push(`${where}: a section marker has no closing marker`)
  }
  for (const match of text.matchAll(section)) {
    if (match[1] !== match[2]) {
      errors.push(`${where}: section '${match[1]}' is closed by '${match[2]}'`)
    }
    found.set(match[1]!, match)
  }
  return found
}

function compose(
  origin: string,
  page: Page,
  errors: Array<string>,
  file: string,
) {
  // replaceContent
  let result = origin
  const replace = page.data.replace
  if (replace && typeof replace === 'object') {
    for (const [key, value] of Object.entries(replace)) {
      let pattern: RegExp
      try {
        pattern = new RegExp(key, 'g')
      } catch (error) {
        errors.push(
          `${file}: replace key ${JSON.stringify(key)} is not a regular expression: ${String(error)}`,
        )
        continue
      }
      if (new RegExp(`^(?:${key})`).test('')) {
        errors.push(
          `${file}: replace key ${JSON.stringify(key)} matches the empty string (escape | ( ) [ ] . * + ? etc.)`,
        )
        continue
      }
      result = result.replace(pattern, String(value))
    }
  }
  // replaceSections
  const substitutes = sectionsOf(page.content, file, errors)
  const targets = sectionsOf(result, String(page.data.ref), errors)
  for (const name of substitutes.keys()) {
    if (!targets.has(name)) {
      errors.push(
        `${file}: section '${name}' is not in ${String(page.data.ref)}`,
      )
    }
  }
  for (const [name, value] of [...substitutes.entries()].reverse()) {
    const target = targets.get(name)
    if (target) {
      result =
        result.slice(0, target.index) +
        value[0] +
        result.slice(target.index! + target[0].length)
    }
  }
  return result.replaceAll(sectionMarker, '')
}

const errors: Array<string> = []
const files = await glob('docs/**/*.md', { ignore: ['**/node_modules/**'] })
const composedFiles = new Set<string>()
for (const file of files.sort()) {
  const source = readFileSync(file, 'utf8')
  const page = parsePage(source)
  if (typeof page.data.ref !== 'string') {
    continue
  }
  if (!existsSync(page.data.ref)) {
    errors.push(`${file}: ref ${page.data.ref} does not exist`)
    continue
  }
  const origin = readFileSync(page.data.ref, 'utf8')
  if (typeof parsePage(origin).data.ref === 'string') {
    errors.push(
      `${file}: ref ${page.data.ref} is itself a ref page (the site applies only the last page's replacements)`,
    )
    continue
  }
  const result = compose(origin, page, errors, file)
  composedFiles.add(file)
  if (result.length > 2 * (origin.length + source.length)) {
    errors.push(
      `${file}: composes to ${result.length} characters from ${origin.length} + ${source.length}`,
    )
  }
  const expected = expectations[file]
  for (const text of expected?.present ?? []) {
    if (!result.includes(text)) {
      errors.push(`${file}: the composed page lacks ${JSON.stringify(text)}`)
    }
  }
  for (const pattern of expected?.absent ?? []) {
    const match = pattern.exec(result)
    if (match) {
      const line = result.slice(0, match.index).split('\n').length
      errors.push(
        `${file}: the composed page contains ${JSON.stringify(match[0])} (line ${line} of the composed page)`,
      )
    }
  }
}
for (const file of Object.keys(expectations)) {
  if (!composedFiles.has(file)) {
    errors.push(`${file}: has expectations but is not a page composed by ref`)
  }
}

if (errors.length > 0) {
  console.log(`❌ ${errors.length} problems in pages composed by ref:\n`)
  for (const error of errors) {
    console.log(`${error}\n`)
  }
  process.exit(1)
}
console.log(`✅ ${composedFiles.size} pages composed by ref: no problems`)
