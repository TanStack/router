import cssText from './styles.css?inline'

// One constructed stylesheet per document: a constructed stylesheet can only
// be adopted by the document that created it and that document's shadow roots.
const sheets = new WeakMap<Document, CSSStyleSheet>()

/**
 * Adopts the devtools stylesheet where `el` renders: the given
 * `shadowDOMTarget`, else the shadow root that contains `el`, else the
 * document that owns `el`. Adopted stylesheets are not `<style>` elements, so
 * they need no CSP nonce and no Trusted Types policy.
 */
export function attachStyles(el: Element, shadowDOMTarget?: ShadowRoot) {
  const root = el.getRootNode()
  const container: Document | ShadowRoot =
    shadowDOMTarget ??
    // A shadow root is a document fragment with a host. `instanceof ShadowRoot`
    // would miss shadow roots from other windows, e.g. picture-in-picture.
    (root.nodeType === 11 && 'host' in root
      ? (root as ShadowRoot)
      : el.ownerDocument)
  // Not supported before Safari 16.4 and Firefox 101, nor in jsdom.
  if (!('adoptedStyleSheets' in (container as object))) return

  const doc = container.ownerDocument ?? container
  let sheet = sheets.get(doc)
  if (!sheet) {
    sheet = new (doc.defaultView ?? window).CSSStyleSheet()
    sheet.replaceSync(cssText)
    sheets.set(doc, sheet)
  }

  if (!container.adoptedStyleSheets.includes(sheet)) {
    container.adoptedStyleSheets = [...container.adoptedStyleSheets, sheet]
  }
}
