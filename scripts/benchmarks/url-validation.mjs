// Run with: node scripts/benchmarks/url-validation.mjs
import { performance } from 'node:perf_hooks'

const inputs = {
  absolute: [
    'https://example.com/path?q=1#hash',
    'http://localhost:3000/',
    'mailto:user@example.com',
    'https://example.org/',
  ],
  relative: ['/posts', '../posts/1', '?search=test', '#section'],
  malformed: [
    'http://',
    'https://[::1',
    'https://example.com:99999',
    'http://exa mple.com',
  ],
  mixed: [
    '/posts',
    '/posts/1',
    '../settings',
    'https://example.com/',
    '/about',
    '?q=a',
    '#top',
    'mailto:user@example.com',
  ],
}

function construct(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

function canParse(url) {
  return URL.canParse(url)
}

function withFallback(url) {
  if (URL.canParse) {
    return URL.canParse(url)
  }
  return construct(url)
}

const methods = { construct, canParse, withFallback }
const iterations = 100_000
const samples = 7
let sink = 0

function measure(fn, urls, count) {
  const start = performance.now()
  for (let i = 0; i < count; i++) {
    sink += Number(fn(urls[i % urls.length]))
  }
  return ((performance.now() - start) * 1e6) / count
}

console.log(`Node ${process.version}; median ns/check; ${samples} samples`)
const results = []
for (const [scenario, urls] of Object.entries(inputs)) {
  for (const url of urls) {
    if (construct(url) !== canParse(url)) {
      throw new Error(`Validation mismatch: ${url}`)
    }
  }
  const timings = Object.fromEntries(
    Object.keys(methods).map((name) => [name, []]),
  )
  const entries = Object.entries(methods)
  for (const [, fn] of entries) {
    measure(fn, urls, 20_000)
  }
  for (let sample = 0; sample < samples; sample++) {
    // Rotate execution order between samples.
    for (let i = 0; i < entries.length; i++) {
      const [name, fn] = entries[(i + sample) % entries.length]
      timings[name].push(measure(fn, urls, iterations))
    }
  }
  const medians = Object.fromEntries(
    Object.entries(timings).map(([name, times]) => [
      name,
      times.sort((a, b) => a - b)[Math.floor(samples / 2)],
    ]),
  )
  results.push({
    scenario,
    ...Object.fromEntries(
      Object.entries(medians).map(([name, time]) => [name, Math.round(time)]),
    ),
    speedup: `${(medians.construct / medians.withFallback).toFixed(1)}x`,
  })
}
console.table(results)
console.log(`Result checksum: ${sink}`)
