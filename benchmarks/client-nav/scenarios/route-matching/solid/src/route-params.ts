import { normalizeNumericId, normalizeSlug } from '../../shared'

type CatalogParams = {
  category: string
  id: number
}

type DocsParams = {
  section?: string
  slug: string
}

type SlugParams = {
  slug: string
}

type CodeParams = {
  code: string
}

type PriorityValueParams = {
  value: string
}

type PriorityFallbackParams = {
  fallback: string
}

export function parseCatalogParams(params: { category: string; id: string }) {
  return {
    category: normalizeSlug(params.category),
    id: normalizeNumericId(params.id),
  }
}

export function stringifyCatalogParams(params: CatalogParams) {
  return {
    category: normalizeSlug(params.category),
    id: `${params.id}`,
  }
}

export function parseDocsParams(params: { section?: string; slug: string }) {
  return {
    section:
      params.section === undefined ? undefined : normalizeSlug(params.section),
    slug: normalizeSlug(params.slug),
  }
}

export function stringifyDocsParams(params: DocsParams) {
  return {
    section:
      params.section === undefined ? undefined : normalizeSlug(params.section),
    slug: normalizeSlug(params.slug),
  }
}

export function parseSlugParams(params: { slug: string }) {
  return {
    slug: normalizeSlug(params.slug),
  }
}

export function stringifySlugParams(params: SlugParams) {
  return {
    slug: normalizeSlug(params.slug),
  }
}

export function parseCodeParams(params: { code: string }) {
  return {
    code: normalizeSlug(params.code),
  }
}

export function stringifyCodeParams(params: CodeParams) {
  return {
    code: normalizeSlug(params.code),
  }
}

export function parsePriorityValueParams(params: { value: string }) {
  const value = normalizeSlug(params.value)

  if (!value.startsWith('fast-')) {
    return false
  }

  return {
    value,
  }
}

export function stringifyPriorityValueParams(params: PriorityValueParams) {
  return {
    value: normalizeSlug(params.value),
  }
}

export function parsePriorityFallbackParams(params: { fallback: string }) {
  return {
    fallback: normalizeSlug(params.fallback),
  }
}

export function stringifyPriorityFallbackParams(
  params: PriorityFallbackParams,
) {
  return {
    fallback: normalizeSlug(params.fallback),
  }
}
