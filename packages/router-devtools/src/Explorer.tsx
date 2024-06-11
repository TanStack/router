import * as React from 'react'
import { clsx as cx } from 'clsx'
import * as goober from 'goober'
import { tokens } from './tokens'
import { displayValue, styled } from './utils'
import { ShadowDomTargetContext } from './context'

type ExpanderProps = {
  expanded: boolean
  style?: React.CSSProperties
}

export const Expander = ({ expanded, style = {} }: ExpanderProps) => {
  const styles = useStyles()
  return (
    <span className={styles.expander}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        fill="none"
        viewBox="0 0 24 24"
        className={cx(styles.expanderIcon(expanded))}
      >
        <path
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
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
  label?: React.ReactNode
  value: unknown
  subEntries: Array<Entry>
  subEntryPages: Array<Array<Entry>>
  type: string
  expanded: boolean
  toggleExpanded: () => void
  pageSize: number
  renderer?: Renderer
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

type Renderer = (props: RendererProps) => React.JSX.Element

export const DefaultRenderer: Renderer = ({
  handleEntry,
  label,
  value,
  subEntries = [],
  subEntryPages = [],
  type,
  expanded = false,
  toggleExpanded,
  pageSize,
  renderer,
}) => {
  const [expandedPages, setExpandedPages] = React.useState<Array<number>>([])
  const [valueSnapshot, setValueSnapshot] = React.useState(undefined)
  const styles = useStyles()

  const refreshValueSnapshot = () => {
    setValueSnapshot((value as () => any)())
  }

  return (
    <div className={styles.entry}>
      {subEntryPages.length ? (
        <>
          <button
            className={styles.expandButton}
            onClick={() => toggleExpanded()}
          >
            <Expander expanded={expanded} />
            {label}
            <span className={styles.info}>
              {String(type).toLowerCase() === 'iterable' ? '(Iterable) ' : ''}
              {subEntries.length} {subEntries.length > 1 ? `items` : `item`}
            </span>
          </button>
          {expanded ? (
            subEntryPages.length === 1 ? (
              <div className={styles.subEntries}>
                {subEntries.map((entry, index) => handleEntry(entry))}
              </div>
            ) : (
              <div className={styles.subEntries}>
                {subEntryPages.map((entries, index) => {
                  return (
                    <div key={index}>
                      <div className={styles.entry}>
                        <button
                          className={cx(styles.labelButton, 'labelButton')}
                          onClick={() =>
                            setExpandedPages((old) =>
                              old.includes(index)
                                ? old.filter((d) => d !== index)
                                : [...old, index],
                            )
                          }
                        >
                          <Expander expanded={expandedPages.includes(index)} />{' '}
                          [{index * pageSize} ...{' '}
                          {index * pageSize + pageSize - 1}]
                        </button>
                        {expandedPages.includes(index) ? (
                          <div className={styles.subEntries}>
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
      ) : type === 'function' ? (
        <>
          <Explorer
            renderer={renderer}
            label={
              <button
                onClick={refreshValueSnapshot}
                className={styles.refreshValueBtn}
              >
                <span>{label}</span> 🔄{' '}
              </button>
            }
            value={valueSnapshot}
            defaultExpanded={{}}
          />
        </>
      ) : (
        <>
          <span>{label}:</span>{' '}
          <span className={styles.value}>{displayValue(value)}</span>
        </>
      )}
    </div>
  )
}

type HandleEntryFn = (entry: Entry) => React.ReactNode

type ExplorerProps = Partial<RendererProps> & {
  renderer?: Renderer
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

export default function Explorer({
  value,
  defaultExpanded,
  renderer = DefaultRenderer,
  pageSize = 100,
  filterSubEntries,
  ...rest
}: ExplorerProps) {
  const [expanded, setExpanded] = React.useState(Boolean(defaultExpanded))
  const toggleExpanded = React.useCallback(() => setExpanded((old) => !old), [])

  let type: string = typeof value
  let subEntries: Array<Property> = []

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
    type = 'array'
    subEntries = value.map((d, i) =>
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
    type = 'Iterable'
    subEntries = Array.from(value, (val, i) =>
      makeProperty({
        label: i.toString(),
        value: val,
      }),
    )
  } else if (typeof value === 'object' && value !== null) {
    type = 'object'
    subEntries = Object.entries(value).map(([key, val]) =>
      makeProperty({
        label: key,
        value: val,
      }),
    )
  }

  subEntries = filterSubEntries ? filterSubEntries(subEntries) : subEntries

  const subEntryPages = chunkArray(subEntries, pageSize)

  return renderer({
    handleEntry: (entry) => (
      <Explorer
        key={entry.label}
        value={value}
        renderer={renderer}
        filterSubEntries={filterSubEntries}
        {...rest}
        {...entry}
      />
    ),
    type,
    subEntries,
    subEntryPages,
    value,
    expanded,
    toggleExpanded,
    pageSize,
    ...rest,
  })
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

let _styles: ReturnType<typeof stylesFactory> | null = null

function useStyles() {
  const shadowDomTarget = React.useContext(ShadowDomTargetContext)
  if (_styles) return _styles
  _styles = stylesFactory(shadowDomTarget)

  return _styles
}
