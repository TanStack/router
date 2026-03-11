import { bench, describe } from 'vitest'

/**
 * Benchmark comparing different approaches for finding the last closing tag in HTML chunks.
 *
 * The goal is to find the position just after the last closing tag (e.g., </div>, </my-component>)
 * so we can insert router HTML at that point.
 *
 * Requirements (from the regex pattern /(<\/[a-zA-Z][\w:.-]*?>)/g):
 * - Closing tag starts with </
 * - First character after </ must be a letter (a-zA-Z)
 * - Followed by any combination of word chars (\w = [a-zA-Z0-9_]), colons, dots, or hyphens
 * - Ends with >
 */

// ============================================================================
// Implementation 1: Regex-based (current implementation)
// ============================================================================
function findLastClosingTagRegex(str: string): number {
  const patternClosingTag = /(<\/[a-zA-Z][\w:.-]*?>)/g
  let lastIndex = 0
  let result: RegExpExecArray | null
  while ((result = patternClosingTag.exec(str)) !== null) {
    lastIndex = result.index + result[0].length
  }
  return lastIndex > 0 ? lastIndex : -1
}

// ============================================================================
// Implementation 2: Manual backwards scan
// ============================================================================
function isTagNameStartChar(char: string): boolean {
  const code = char.charCodeAt(0)
  // a-z: 97-122, A-Z: 65-90
  return (code >= 97 && code <= 122) || (code >= 65 && code <= 90)
}

function isTagNameChar(char: string): boolean {
  const code = char.charCodeAt(0)
  // a-z: 97-122, A-Z: 65-90, 0-9: 48-57, _: 95, :: 58, .: 46, -: 45
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 || // _
    code === 58 || // :
    code === 46 || // .
    code === 45 // -
  )
}

function findLastClosingTagManual(str: string): number {
  // Search backwards for </...> pattern
  let i = str.length - 1

  while (i >= 1) {
    // Look for >
    if (str[i] === '>') {
      // Look backwards for </
      let j = i - 1
      let foundValidTag = false

      // Skip through valid tag name characters
      while (j >= 1 && isTagNameChar(str[j]!)) {
        j--
      }

      // Check if the first char after </ is a valid start char (letter only)
      const tagNameStart = j + 1
      if (tagNameStart < i && isTagNameStartChar(str[tagNameStart]!)) {
        // Check for </
        if (j >= 1 && str[j] === '/' && str[j - 1] === '<') {
          foundValidTag = true
        }
      }

      if (foundValidTag) {
        return i + 1 // Return position after the closing >
      }
    }
    i--
  }
  return -1
}

// ============================================================================
// Implementation 3: Optimized manual with charCodeAt (avoid string indexing)
// ============================================================================
function findLastClosingTagOptimized(str: string): number {
  const len = str.length
  if (len < 4) return -1 // Minimum: </a>

  let i = len - 1

  while (i >= 3) {
    // Need at least 4 chars: </a>
    // Look for > (charCode 62)
    if (str.charCodeAt(i) === 62) {
      // Look backwards for </
      let j = i - 1

      // Skip through valid tag name characters
      while (j >= 1) {
        const code = str.charCodeAt(j)
        // Check if it's a valid tag name char
        if (
          (code >= 97 && code <= 122) || // a-z
          (code >= 65 && code <= 90) || // A-Z
          (code >= 48 && code <= 57) || // 0-9
          code === 95 || // _
          code === 58 || // :
          code === 46 || // .
          code === 45 // -
        ) {
          j--
        } else {
          break
        }
      }

      // Check if the first char after </ is a valid start char (letter only)
      const tagNameStart = j + 1
      if (tagNameStart < i) {
        const startCode = str.charCodeAt(tagNameStart)
        // Must start with a letter
        if (
          (startCode >= 97 && startCode <= 122) ||
          (startCode >= 65 && startCode <= 90)
        ) {
          // Check for </ (charCodes: < = 60, / = 47)
          if (
            j >= 1 &&
            str.charCodeAt(j) === 47 &&
            str.charCodeAt(j - 1) === 60
          ) {
            return i + 1 // Return position after the closing >
          }
        }
      }
    }
    i--
  }
  return -1
}

// ============================================================================
// Implementation 4: Hybrid - use lastIndexOf to find candidates, then validate
// ============================================================================
function findLastClosingTagHybrid(str: string): number {
  let searchFrom = str.length - 1

  while (searchFrom >= 3) {
    // Find the last > starting from searchFrom
    const closeIndex = str.lastIndexOf('>', searchFrom)
    if (closeIndex < 3) return -1 // Not enough room for </a>

    // Look backwards for </
    let j = closeIndex - 1

    // Skip through valid tag name characters using charCodeAt
    while (j >= 1) {
      const code = str.charCodeAt(j)
      if (
        (code >= 97 && code <= 122) || // a-z
        (code >= 65 && code <= 90) || // A-Z
        (code >= 48 && code <= 57) || // 0-9
        code === 95 || // _
        code === 58 || // :
        code === 46 || // .
        code === 45 // -
      ) {
        j--
      } else {
        break
      }
    }

    // Check if the first char after </ is a valid start char (letter only)
    const tagNameStart = j + 1
    if (tagNameStart < closeIndex) {
      const startCode = str.charCodeAt(tagNameStart)
      if (
        (startCode >= 97 && startCode <= 122) ||
        (startCode >= 65 && startCode <= 90)
      ) {
        if (
          j >= 1 &&
          str.charCodeAt(j) === 47 &&
          str.charCodeAt(j - 1) === 60
        ) {
          return closeIndex + 1
        }
      }
    }

    // Not a valid tag, continue searching before this >
    searchFrom = closeIndex - 1
  }

  return -1
}

// ============================================================================
// Test Data Generation
// ============================================================================

// Small chunk - typical streaming chunk
function generateSmallChunk(): string {
  return `<div class="container"><p>Hello World</p><span>Some text</span></div>`
}

// Medium chunk - several elements
function generateMediumChunk(): string {
  let html = '<div class="app">'
  for (let i = 0; i < 10; i++) {
    html += `<section id="section-${i}"><h2>Title ${i}</h2><p>Paragraph with some content ${i}</p><my-component data-id="${i}">Custom element content</my-component></section>`
  }
  html += '</div>'
  return html
}

// Large chunk - many elements
function generateLargeChunk(): string {
  let html = '<html><head><title>Test</title></head><body>'
  for (let i = 0; i < 100; i++) {
    html += `<div class="item item-${i}"><span class="label">Label ${i}</span><input type="text" value="${i}"/><button>Click</button></div>`
  }
  html += '</body></html>'
  return html
}

// Chunk with custom elements (web components)
function generateWebComponentChunk(): string {
  let html = '<div class="app">'
  for (let i = 0; i < 20; i++) {
    html += `<my-custom-element-${i % 5}><slot-content:nested.child></slot-content:nested.child></my-custom-element-${i % 5}>`
  }
  html += '</div>'
  return html
}

// Chunk with no closing tags (edge case)
function generateNoClosingTagChunk(): string {
  return 'This is just plain text with no HTML tags at all'
}

// Chunk ending mid-tag (streaming edge case)
function generatePartialChunk(): string {
  return '<div><p>Content</p><span>More'
}

// Chunk with nested structure (realistic React output)
function generateNestedChunk(): string {
  return `<div class="root"><div class="layout"><header class="header"><nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav></header><main class="main"><article><h1>Article Title</h1><p>First paragraph with <strong>bold</strong> and <em>italic</em> text.</p><p>Second paragraph with a <a href="#">link</a>.</p></article></main><footer><p>Footer content</p></footer></div></div>`
}

// Verify all implementations return the same result
function verifyImplementations() {
  const testCases = [
    generateSmallChunk(),
    generateMediumChunk(),
    generateLargeChunk(),
    generateWebComponentChunk(),
    generateNoClosingTagChunk(),
    generatePartialChunk(),
    generateNestedChunk(),
    '</div>',
    '<div></div>',
    '</my-component:nested.element>',
    'no tags here',
    '',
  ]

  for (const testCase of testCases) {
    const regexResult = findLastClosingTagRegex(testCase)
    const manualResult = findLastClosingTagManual(testCase)
    const optimizedResult = findLastClosingTagOptimized(testCase)
    const hybridResult = findLastClosingTagHybrid(testCase)

    if (
      regexResult !== manualResult ||
      regexResult !== optimizedResult ||
      regexResult !== hybridResult
    ) {
      console.error('Mismatch for:', testCase.slice(0, 50))
      console.error('  Regex:', regexResult)
      console.error('  Manual:', manualResult)
      console.error('  Optimized:', optimizedResult)
      console.error('  Hybrid:', hybridResult)
      throw new Error('Implementation mismatch!')
    }
  }
  console.log('All implementations verified to produce identical results')
}

// Run verification before benchmarks
verifyImplementations()

// ============================================================================
// Benchmarks
// ============================================================================

describe('Closing Tag Detection - Small Chunk (~70 chars)', () => {
  const chunk = generateSmallChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})

describe('Closing Tag Detection - Medium Chunk (~1.5KB)', () => {
  const chunk = generateMediumChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})

describe('Closing Tag Detection - Large Chunk (~13KB)', () => {
  const chunk = generateLargeChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})

describe('Closing Tag Detection - Web Components', () => {
  const chunk = generateWebComponentChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})

describe('Closing Tag Detection - No Closing Tags (worst case for regex)', () => {
  const chunk = generateNoClosingTagChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})

describe('Closing Tag Detection - Nested React-like Structure', () => {
  const chunk = generateNestedChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})

describe('Closing Tag Detection - Partial Chunk (streaming edge case)', () => {
  const chunk = generatePartialChunk()

  bench('regex', () => {
    findLastClosingTagRegex(chunk)
  })

  bench('manual backwards scan', () => {
    findLastClosingTagManual(chunk)
  })

  bench('optimized (charCodeAt)', () => {
    findLastClosingTagOptimized(chunk)
  })

  bench('hybrid (lastIndexOf + validation)', () => {
    findLastClosingTagHybrid(chunk)
  })
})
