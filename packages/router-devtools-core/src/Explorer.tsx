/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import * as Solid from 'solid-js'
import { clsx as cx } from 'clsx'
import * as goober from 'goober'
import { tokens } from './tokens'
import { displayValue } from './utils'
import { ShadowDomTargetContext } from './context'

type ExpanderProps = {
  expanded: boolean
  style?: Solid.JSX.CSSProperties
}

export const Expander = ({ expanded, style = {} }: ExpanderProps) => {
  const styles = useStyles()
  return (
    <span class={styles().expander}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        fill="none"
        viewBox="0 0 24 24"
        class={cx(styles().expanderIcon(expanded))}
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 18l6-6-6-6"
        ></path>
      </svg>
    </span>
  )
}

type Entry = {
  label: string
}

type RendererProps = {
  handleEntry: HandleEntryFn
  label?: Solid.JSX.Element
  value: unknown
  subEntries: Array<Entry>
  subEntryPages: Array<Array<Entry>>
  type: string
  expanded: Solid.Accessor<boolean>
  toggleExpanded: () => void
  pageSize: number
  filterSubEntries?: (subEntries: Array<Property>) => Array<Property>
}

/**
 * Chunk elements in the array by size
 *
 * when the array cannot be chunked evenly by size, the last chunk will be
 * filled with the remaining elements
 *
 * @example
 * chunkArray(['a','b', 'c', 'd', 'e'], 2) // returns [['a','b'], ['c', 'd'], ['e']]
 */
export function chunkArray<T>(array: Array<T>, size: number): Array<Array<T>> {
  if (size < 1) return []
  let i = 0
  const result: Array<Array<T>> = []
  while (i < array.length) {
    result.push(array.slice(i, i + size))
    i = i + size
  }
  return result
}

type HandleEntryFn = (entry: Entry) => Solid.JSX.Element

type ExplorerProps = Partial<RendererProps> & {
  defaultExpanded?: true | Record<string, boolean>
}

type Property = {
  defaultExpanded?: boolean | Record<string, boolean>
  label: string
  value: unknown
}

function isIterable(x: any): x is Iterable<unknown> {
  return Symbol.iterator in x
}

export function Explorer({
  value,
  defaultExpanded,
  pageSize = 100,
  filterSubEntries,
  ...rest
}: ExplorerProps) {
  const [expanded, setExpanded] = Solid.createSignal(Boolean(defaultExpanded))
  const toggleExpanded = () => setExpanded((old) => !old)

  const type = Solid.createMemo(() => typeof value)
  const subEntries = Solid.createMemo(() => {
    let entries: Array<Property> = []

    const makeProperty = (sub: { label: string; value: unknown }): Property => {
      const subDefaultExpanded =
        defaultExpanded === true
          ? { [sub.label]: true }
          : defaultExpanded?.[sub.label]
      return {
        ...sub,
        defaultExpanded: subDefaultExpanded,
      }
    }

    if (Array.isArray(value)) {
      entries = value.map((d, i) =>
        makeProperty({
          label: i.toString(),
          value: d,
        }),
      )
    } else if (
      value !== null &&
      typeof value === 'object' &&
      isIterable(value) &&
      typeof value[Symbol.iterator] === 'function'
    ) {
      entries = Array.from(value, (val, i) =>
        makeProperty({
          label: i.toString(),
          value: val,
        }),
      )
    } else if (typeof value === 'object' && value !== null) {
      entries = Object.entries(value).map(([key, val]) =>
        makeProperty({
          label: key,
          value: val,
        }),
      )
    }

    return filterSubEntries ? filterSubEntries(entries) : entries
  })

  const subEntryPages = Solid.createMemo(() => chunkArray(subEntries(), pageSize))

  const [expandedPages, setExpandedPages] = Solid.createSignal<Array<number>>(
    [],
  )
  const [valueSnapshot, setValueSnapshot] = Solid.createSignal(undefined)
  const styles = useStyles()

  const refreshValueSnapshot = () => {
    setValueSnapshot((value as () => any)())
  }

  const handleEntry = (entry: Entry) => (
    <Explorer
      value={value}
      filterSubEntries={filterSubEntries}
      {...rest}
      {...entry}
    />
  )

  return (
    <div class={styles().entry}>
      {subEntryPages().length ? (
        <>
          <button
            class={styles().expandButton}
            onClick={() => toggleExpanded()}
          >
            <Expander expanded={expanded() ?? false} />
            {rest.label}
            <span class={styles().info}>
              {String(type).toLowerCase() === 'iterable' ? '(Iterable) ' : ''}
              {subEntries().length} {subEntries().length > 1 ? `items` : `item`}
            </span>
          </button>
          {(expanded() ?? false) ? (
            subEntryPages().length === 1 ? (
              <div class={styles().subEntries}>
                {subEntries().map((entry, index) => handleEntry(entry))}
              </div>
            ) : (
              <div class={styles().subEntries}>
                {subEntryPages().map((entries, index) => {
                  return (
                    <div>
                      <div class={styles().entry}>
                        <button
                          class={cx(styles().labelButton, 'labelButton')}
                          onClick={() =>
                            setExpandedPages((old) =>
                              old.includes(index)
                                ? old.filter((d) => d !== index)
                                : [...old, index],
                            )
                          }
                        >
                          <Expander
                            expanded={expandedPages().includes(index)}
                          />{' '}
                          [{index * pageSize} ...{' '}
                          {index * pageSize + pageSize - 1}]
                        </button>
                        {expandedPages().includes(index) ? (
                          <div class={styles().subEntries}>
                            {entries.map((entry) => handleEntry(entry))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : null}
        </>
      ) : type() === 'function' ? (
        <>
          <Explorer
            label={
              <button
                onClick={refreshValueSnapshot}
                class={styles().refreshValueBtn}
              >
                <span>{rest.label}</span> 🔄{' '}
              </button>
            }
            value={valueSnapshot}
            defaultExpanded={{}}
          />
        </>
      ) : (
        <>
          <span>{rest.label}:</span>{' '}
          <span class={styles().value}>{displayValue(value)}</span>
        </>
      )}
    </div>
  )
}

const stylesFactory = (shadowDOMTarget?: ShadowRoot) => {
  const { colors, font, size, alpha, shadow, border } = tokens
  const { fontFamily, lineHeight, size: fontSize } = font
  const css = shadowDOMTarget
    ? goober.css.bind({ target: shadowDOMTarget })
    : goober.css

  return {
    entry: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      line-height: ${lineHeight.sm};
      outline: none;
      word-break: break-word;
    `,
    labelButton: css`
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,
    expander: css`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: ${size[3]};
      height: ${size[3]};
      padding-left: 3px;
      box-sizing: content-box;
    `,
    expanderIcon: (expanded: boolean) => {
      if (expanded) {
        return css`
          transform: rotate(90deg);
          transition: transform 0.1s ease;
        `
      }
      return css`
        transform: rotate(0deg);
        transition: transform 0.1s ease;
      `
    },
    expandButton: css`
      display: flex;
      gap: ${size[1]};
      align-items: center;
      cursor: pointer;
      color: inherit;
      font: inherit;
      outline: inherit;
      background: transparent;
      border: none;
      padding: 0;
    `,
    value: css`
      color: ${colors.purple[400]};
    `,
    subEntries: css`
      margin-left: ${size[2]};
      padding-left: ${size[2]};
      border-left: 2px solid ${colors.darkGray[400]};
    `,
    info: css`
      color: ${colors.gray[500]};
      font-size: ${fontSize['2xs']};
      padding-left: ${size[1]};
    `,
    refreshValueBtn: css`
      appearance: none;
      border: 0;
      cursor: pointer;
      background: transparent;
      color: inherit;
      padding: 0;
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
    `,
  }
}

function useStyles() {
  const shadowDomTarget = Solid.useContext(ShadowDomTargetContext)
  const [_styles] = Solid.createSignal(stylesFactory(shadowDomTarget))
  return _styles
}
