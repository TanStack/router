import cssText from './styles.css?inline'
import type { Accessor } from 'solid-js'

type Color = 'green' | 'red' | 'yellow' | 'gray' | 'blue' | 'purple'

/** Class names from styles.css. */
export const styles = {
  devtoolsPanelContainer: 'tsrd-devtools-panel-container',
  devtoolsPanelContainerVisibility: (isOpen: boolean) =>
    isOpen ? '' : 'tsrd-devtools-panel-container-hidden',
  devtoolsPanelContainerResizing: (isResizing: Accessor<boolean>) =>
    isResizing() ? 'tsrd-devtools-panel-container-resizing' : '',
  /** The closed offset comes from `--tsrd-panel-offset`. */
  devtoolsPanelContainerAnimation: (isOpen: boolean) =>
    isOpen ? '' : 'tsrd-devtools-panel-container-closed',
  logo: 'tsrd-logo',
  tanstackLogo: 'tsrd-tanstack-logo',
  routerLogo: 'tsrd-router-logo',
  devtoolsPanel: 'tsrd-devtools-panel',
  dragHandle: 'tsrd-drag-handle',
  firstContainer: 'tsrd-first-container',
  secondContainer: 'tsrd-second-container',
  thirdContainer: 'tsrd-third-container',
  fourthContainer: 'tsrd-fourth-container',
  routerExplorerContainer: 'tsrd-router-explorer-container',
  routerExplorer: 'tsrd-router-explorer',
  row: 'tsrd-row',
  detailsHeader: 'tsrd-details-header',
  detailsHeaderInfo: 'tsrd-details-header-info',
  detailsContent: 'tsrd-details-content',
  maskedBadgeContainer: 'tsrd-masked-badge-container',
  maskedBadge: 'tsrd-masked-badge',
  maskedLocation: 'tsrd-masked-location',
  routeMatchesToggle: 'tsrd-route-matches-toggle',
  routeMatchesToggleBtn: (active: boolean, showBorder: boolean) =>
    `tsrd-route-matches-toggle-btn${active ? ' tsrd-route-matches-toggle-btn-active' : ''}${showBorder ? ' tsrd-route-matches-toggle-btn-border' : ''}`,
  routesContainer: 'tsrd-routes-container',
  routesRowContainer: (active: boolean, isMatch: boolean) =>
    `tsrd-routes-row-container${isMatch ? ' tsrd-routes-row-container-match' : ''}${active ? ' tsrd-routes-row-container-active' : ''}`,
  routesRow: (isMatch: boolean) =>
    isMatch ? 'tsrd-routes-row' : 'tsrd-routes-row tsrd-routes-row-unmatched',
  nestedRouteRow: (isRoot: boolean) => (isRoot ? '' : 'tsrd-nested-route-row'),
  routeParamInfo: 'tsrd-route-param-info',
  code: 'tsrd-code',
  matchesContainer: 'tsrd-matches-container',
  cachedMatchesContainer: 'tsrd-cached-matches-container',
  historyOverflowContainer: 'tsrd-history-overflow-container',
  matchRow: (active: boolean) =>
    active ? 'tsrd-match-row tsrd-match-row-active' : 'tsrd-match-row',
  matchID: 'tsrd-match-id',
  matchIndicator: (color: Color) =>
    `tsrd-match-indicator tsrd-match-indicator-${color}`,
  ageTicker: (showWarning: boolean) =>
    showWarning ? 'tsrd-age-ticker tsrd-age-ticker-warning' : 'tsrd-age-ticker',
  matchDetails: 'tsrd-match-details',
  matchStatus: (
    status: 'pending' | 'success' | 'error' | 'notFound',
    isFetching: false | 'beforeLoad' | 'loader',
  ) => {
    const colorMap = {
      pending: 'yellow',
      success: 'green',
      error: 'red',
      notFound: 'purple',
    } as const

    const color =
      isFetching && status === 'success'
        ? isFetching === 'beforeLoad'
          ? 'purple'
          : 'blue'
        : colorMap[status]

    return `tsrd-match-status tsrd-match-status-${color}`
  },
  matchDetailsInfo: 'tsrd-match-details-info',
  matchDetailsInfoLabel: 'tsrd-match-details-info-label',
  mainCloseBtn: 'tsrd-main-close-btn',
  mainCloseBtnPosition: (
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  ) => `tsrd-main-close-btn-${position}`,
  mainCloseBtnAnimation: (isOpen: boolean) =>
    isOpen ? 'tsrd-main-close-btn-hidden' : '',
  routerLogoCloseButton: 'tsrd-router-logo-close-button',
  mainCloseBtnDivider: 'tsrd-main-close-btn-divider',
  mainCloseBtnIconContainer: 'tsrd-main-close-btn-icon-container',
  mainCloseBtnIconOuter: 'tsrd-main-close-btn-icon-outer',
  mainCloseBtnIconInner: 'tsrd-main-close-btn-icon-inner',
  panelCloseBtn: 'tsrd-panel-close-btn',
  panelCloseBtnIcon: 'tsrd-panel-close-btn-icon',
  navigateButton: 'tsrd-navigate-button',
  // Explorer
  entry: 'tsrd-explorer-entry',
  labelButton: 'tsrd-explorer-label-button',
  expander: 'tsrd-explorer-expander',
  expanderIcon: (expanded: boolean) =>
    expanded
      ? 'tsrd-explorer-expander-icon tsrd-explorer-expander-icon-expanded'
      : 'tsrd-explorer-expander-icon',
  expandButton: 'tsrd-explorer-expand-button',
  value: 'tsrd-explorer-value',
  compositeComponent: 'tsrd-explorer-composite-component',
  renderableComponent: 'tsrd-explorer-renderable-component',
  rscMetaRow: 'tsrd-explorer-rsc-meta-row',
  rscMetaLabel: 'tsrd-explorer-rsc-meta-label',
  subEntries: 'tsrd-explorer-sub-entries',
  info: 'tsrd-explorer-info',
  refreshValueBtn: 'tsrd-explorer-refresh-value-btn',
}

// One constructed stylesheet per window: a constructed stylesheet can only be
// adopted by the document and shadow roots of the window that created it.
const sheets = new WeakMap<Window, CSSStyleSheet>()

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

  const view = el.ownerDocument.defaultView ?? window
  let sheet = sheets.get(view)
  if (!sheet) {
    sheet = new view.CSSStyleSheet()
    sheet.replaceSync(cssText)
    sheets.set(view, sheet)
  }

  if (!container.adoptedStyleSheets.includes(sheet)) {
    container.adoptedStyleSheets = [...container.adoptedStyleSheets, sheet]
  }
}
