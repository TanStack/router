import { useEffect } from 'preact/hooks'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useHydrated } from './ClientOnly'
import { useTags } from './headContentUtils'

const DEV_STYLES_ATTR = 'data-tanstack-router-dev-styles'

/**
 * Render route-managed head tags (title, meta, links, styles, head scripts).
 * Place inside the document head of your app shell.
 *
 * Development version: filters out dev styles link after hydration and
 * includes a fallback cleanup effect for hydration mismatch cases.
 */
export function HeadContent() {
  const tags = useTags()
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const hydrated = useHydrated()

  // Fallback cleanup for hydration mismatch cases
  useEffect(() => {
    if (hydrated) {
      document
        .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
        .forEach((el) => el.remove())
    }
  }, [hydrated])

  // Filter out dev styles after hydration
  const filteredTags = hydrated
    ? tags.filter((tag) => !tag.attrs?.[DEV_STYLES_ATTR])
    : tags

  return (
    <>
      {filteredTags.map((tag) => (
        <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
      ))}
    </>
  )
}
