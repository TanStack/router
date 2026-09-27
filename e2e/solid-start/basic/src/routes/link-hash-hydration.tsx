import { createSignal, onMount } from 'solid-js'
import {
  Link,
  createFileRoute,
  createLink,
  useRouter,
} from '@tanstack/solid-router'
import type { ComponentProps } from 'solid-js'
import type { LinkOptions } from '@tanstack/solid-router'

declare global {
  interface Window {
    initialHashLinks: Record<string, { href?: string; active: boolean }>
  }
}

const cases: Array<{
  id: string
  hash?: LinkOptions['hash']
  insensitive?: boolean
  sourceHash?: string
  href?: string
}> = [
  { id: 'explicit-source', hash: true, sourceHash: 'preset' },
  {
    id: 'explicit-source-function',
    hash: (hash = '') => `${hash}-child`,
    sourceHash: 'preset',
  },
  {
    id: 'explicit-href',
    href: '/link-hash-hydration#fixed',
    hash: () => {
      throw new Error('href overrides hash')
    },
  },
  { id: 'matching', hash: 'details' },
  { id: 'nonmatching', hash: 'other' },
  { id: 'empty', hash: '' },
  { id: 'omitted' },
  { id: 'inherited', hash: true },
  { id: 'identity', hash: (hash = '') => hash },
  { id: 'derived', hash: (hash) => `${hash}-child` },
  { id: 'inherited-insensitive', hash: true, insensitive: true },
  {
    id: 'derived-insensitive',
    hash: (hash) => `${hash}-child`,
    insensitive: true,
  },
  { id: 'ordinary', insensitive: true },
]

// Capture the first client props, before onMount can conceal a mismatch.
const ObservedLink = createLink((props: ComponentProps<'a'>) => {
  if (typeof window !== 'undefined') {
    window.initialHashLinks ??= {}
    window.initialHashLinks[props.id!] ??= {
      href: props.href,
      active: props['aria-current'] === 'page',
    }
  }
  return <a {...props} />
})

export const Route = createFileRoute('/link-hash-hydration')({
  component: Page,
})

function Page() {
  const router = useRouter()
  const [mounted, setMounted] = createSignal(false)
  const [includeHash, setIncludeHash] = createSignal(true)
  const [show, setShow] = createSignal(false)
  onMount(() => setMounted(true))
  return (
    <main data-testid="hash-links" data-mounted={mounted()}>
      {cases.map((entry) => (
        <ObservedLink
          id={entry.id}
          to="/link-hash-hydration"
          hash={entry.hash}
          href={entry.href}
          _fromLocation={
            entry.sourceHash
              ? { ...router.stores.location.get(), hash: entry.sourceHash }
              : undefined
          }
          activeOptions={{ includeHash: !entry.insensitive && includeHash() }}
          inactiveProps={{ class: 'inactive' }}
        >
          {({ isActive }) =>
            isActive ? <strong>active</strong> : <em>inactive</em>
          }
        </ObservedLink>
      ))}
      <button onClick={() => setIncludeHash((value) => !value)}>
        Toggle hash matching
      </button>
      <button onClick={() => setShow(true)}>Mount link</button>
      {show() && (
        <ObservedLink
          id="later"
          to="/link-hash-hydration"
          hash={true}
          activeOptions={{ includeHash: true }}
        >
          {({ isActive }) => String(isActive)}
        </ObservedLink>
      )}
      <Link id="navigate-other" to="/link-hash-hydration" hash="other">
        Other hash
      </Link>
    </main>
  )
}
