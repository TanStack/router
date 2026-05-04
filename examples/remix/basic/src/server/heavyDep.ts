/**
 * A deliberately-fat module used by the user-bio renderer to
 * demonstrate the bundle-savings unlock of the env-gated polyglot
 * pattern (`src/lib/renderUser.ts`).
 *
 * Imagine this is your real server-only library (markdown renderer,
 * date formatter, image-pipeline, DB ORM, etc.). It must NEVER ship to
 * the client; the bundle savings come from this module being reachable
 * only through `userRenderer.renderUserBio`, which is itself only
 * imported behind an `import.meta.env.SSR` guard. After Vite's env
 * substitution + rolldown DCE, the dynamic-import branch is dead and
 * `heavyDep` falls out of the client build entirely.
 *
 * Implementation: pad with constant-time CPU work + lookup tables so
 * the gzipped size is non-trivial even after minification. Real
 * server-side libraries are typically 30–200 KB minified — we mimic
 * that with ~2 KB of constants here.
 */

export function fancyFormat(date: Date, opts: { locale?: string } = {}): string {
  const locale = opts.locale ?? 'en-US'
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const m = months[date.getMonth()]
  const d = date.getDate()
  const y = date.getFullYear()
  const time = date.toTimeString().slice(0, 8)
  return `${m} ${d}, ${y} ${time} (${locale})`
}

export function summarize(text: string, max = 200): string {
  if (text.length <= max) return text
  const words = text.split(/\s+/)
  const out: Array<string> = []
  let total = 0
  for (const w of words) {
    if (total + w.length + 1 > max) break
    out.push(w)
    total += w.length + 1
  }
  return out.join(' ') + '…'
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has',
  'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to',
  'was', 'were', 'will', 'with', 'or', 'but', 'not', 'this', 'these',
  'those', 'they', 'their', 'there', 'where', 'when', 'which', 'who',
  'whom', 'whose', 'why', 'how', 'what',
])

export function topKeywords(text: string, k = 3): Array<string> {
  const counts: Record<string, number> = {}
  for (const word of text.toLowerCase().split(/[^a-z]+/g)) {
    if (!word || STOPWORDS.has(word)) continue
    counts[word] = (counts[word] ?? 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([w]) => w)
}

export function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const NUMBER_NAMES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty',
  'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
  'thousand', 'million',
]

export function spellNumber(n: number): string {
  if (n < 0) return 'negative ' + spellNumber(-n)
  if (n < 20) return NUMBER_NAMES[n]!
  if (n < 100) {
    const tens = Math.floor(n / 10) + 18
    const ones = n % 10
    return ones ? `${NUMBER_NAMES[tens]}-${NUMBER_NAMES[ones]}` : NUMBER_NAMES[tens]!
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100)
    const rest = n % 100
    return rest
      ? `${NUMBER_NAMES[hundreds]} hundred ${spellNumber(rest)}`
      : `${NUMBER_NAMES[hundreds]} hundred`
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000)
    const rest = n % 1000
    return rest
      ? `${spellNumber(thousands)} thousand ${spellNumber(rest)}`
      : `${spellNumber(thousands)} thousand`
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000)
    const rest = n % 1_000_000
    return rest
      ? `${spellNumber(millions)} million ${spellNumber(rest)}`
      : `${spellNumber(millions)} million`
  }
  return n.toString()
}

// Round out the surface so DCE has something visible to drop. Real
// server-only deps will weigh much more than this in practice.
export const TZ_OFFSETS_MAP: Record<string, number> = {
  'UTC': 0,
  'America/New_York': -5,
  'America/Los_Angeles': -8,
  'America/Chicago': -6,
  'Europe/London': 0,
  'Europe/Berlin': 1,
  'Europe/Paris': 1,
  'Europe/Madrid': 1,
  'Europe/Stockholm': 1,
  'Europe/Helsinki': 2,
  'Asia/Tokyo': 9,
  'Asia/Shanghai': 8,
  'Asia/Kolkata': 5.5,
  'Asia/Singapore': 8,
  'Australia/Sydney': 11,
  'Pacific/Auckland': 13,
}
