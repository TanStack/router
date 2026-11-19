/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { createMemo, createSignal } from 'solid-js'
import {
  displayValue,
  getServerComponentSlotUsageSummary,
  getServerComponentSlots,
  getServerComponentType,
} from './utils'
import type { Accessor } from 'solid-js'
import type { JSX } from '@solidjs/web'

type ExpanderProps = {
  expanded: boolean
  style?: JSX.CSSProperties
}

export const Expander = (props: ExpanderProps) => {
  return (
    <span class="tsrd-explorer-expander">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        fill="none"
        viewBox="0 0 24 24"
        class={
          props.expanded
            ? 'tsrd-explorer-expander-icon tsrd-explorer-expander-icon-expanded'
            : 'tsrd-explorer-expander-icon'
        }
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
  label?: JSX.Element
  value: Accessor<unknown>
  subEntries: Array<Entry>
  subEntryPages: Array<Array<Entry>>
  type: string
  expanded: Accessor<boolean>
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

type HandleEntryFn = (entry: Entry) => JSX.Element

type ExplorerProps = Partial<RendererProps> & {
  defaultExpanded?: true | Record<string, boolean>
  value: Accessor<unknown>
}

type Property = {
  defaultExpanded?: boolean | Record<string, boolean>
  label: string
  value: unknown
}

function isIterable(x: any): x is Iterable<unknown> {
  return Symbol.iterator in x
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function Explorer({
  value,
  defaultExpanded,
  pageSize = 100,
  filterSubEntries,
  ...rest
}: ExplorerProps) {
  const [expanded, setExpanded] = createSignal(Boolean(defaultExpanded))
  const toggleExpanded = () => setExpanded((old) => !old)

  const type = createMemo(() => typeof value())
  const subEntries = createMemo(() => {
    let entries: Array<Property> = []

    const makeProperty = (sub: { label: string; value: unknown }): Property => {
      const subDefaultExpanded =
        defaultExpanded === true
          ? { [sub.label]: true }
          : defaultExpanded?.[sub.label]
      return {
        ...sub,
        value: () => sub.value,
        defaultExpanded: subDefaultExpanded,
      }
    }

    if (
      Array.isArray(value()) &&
      (value() as Array<any>).length === 2 &&
      (value() as Array<any>)[0] === 'React element' &&
      isPlainObject((value() as Array<any>)[1])
    ) {
      // Special case: treat `["React element", { ...meta }]` as sibling entries
      // to avoid the meta object being rendered as a deeper nested tree.
      const v = value() as ['React element', Record<string, unknown>]
      entries = [
        makeProperty({ label: '0', value: v[0] }),
        ...Object.entries(v[1]).map(([key, val]) =>
          makeProperty({ label: key, value: val }),
        ),
      ]
    } else if (Array.isArray(value())) {
      // any[]
      entries = (value() as Array<any>).map((d, i) =>
        makeProperty({
          label: i.toString(),
          value: d,
        }),
      )
    } else if (
      value() !== null &&
      typeof value() === 'object' &&
      isIterable(value()) &&
      typeof (value() as Iterable<unknown>)[Symbol.iterator] === 'function'
    ) {
      // Iterable<unknown>
      entries = Array.from(value() as Iterable<unknown>, (val, i) =>
        makeProperty({
          label: i.toString(),
          value: val,
        }),
      )
    } else if (typeof value() === 'object' && value() !== null) {
      // object
      entries = Object.entries(value() as object).map(([key, val]) =>
        makeProperty({
          label: key,
          value: val,
        }),
      )
    }

    return filterSubEntries ? filterSubEntries(entries) : entries
  })

  const subEntryPages = createMemo(() => chunkArray(subEntries(), pageSize))

  const [expandedPages, setExpandedPages] = createSignal<Array<number>>([])
  const [valueSnapshot, setValueSnapshot] = createSignal(undefined)

  const refreshValueSnapshot = () => {
    setValueSnapshot((value() as () => any)())
  }

  const handleEntry = (entry: Entry) => (
    <Explorer
      value={value}
      filterSubEntries={filterSubEntries}
      {...rest}
      {...entry}
    />
  )

  const serverComponentType = createMemo(() => getServerComponentType(value()))
  const serverComponentSlots = createMemo(() =>
    getServerComponentSlots(value()),
  )
  const serverComponentSlotUsageSummary = createMemo(() =>
    getServerComponentSlotUsageSummary(value()),
  )

  const isCompositeWithSlots = createMemo(
    () =>
      serverComponentType() === 'compositeSource' &&
      serverComponentSlots().length > 0,
  )

  return (
    <div class="tsrd-explorer-entry">
      {serverComponentType() !== null ? (
        isCompositeWithSlots() ? (
          <>
            <button
              class="tsrd-explorer-expand-button"
              onClick={() => toggleExpanded()}
            >
              <Expander expanded={expanded() ?? false} />
              <span>{rest.label}:</span>
              <span class="tsrd-explorer-composite-component">
                {displayValue(value())}
              </span>
            </button>
            {(expanded() ?? false) ? (
              <div class="tsrd-explorer-rsc-meta-row">
                <span class="tsrd-explorer-rsc-meta-label">slots</span>
                <div class="tsrd-explorer-sub-entries">
                  {serverComponentSlots().map((name) => {
                    const usage = serverComponentSlotUsageSummary()[name]
                    if (!usage) return null
                    return (
                      <Explorer
                        label={`${name}:`}
                        value={() =>
                          usage.invocations.map((args) =>
                            args.length === 1 ? args[0] : args,
                          )
                        }
                      />
                    )
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <span>{rest.label}:</span>{' '}
            <span
              class={
                serverComponentType() === 'compositeSource'
                  ? 'tsrd-explorer-composite-component'
                  : 'tsrd-explorer-renderable-component'
              }
            >
              {displayValue(value())}
            </span>
          </>
        )
      ) : subEntryPages().length ? (
        <>
          <button
            class="tsrd-explorer-expand-button"
            onClick={() => toggleExpanded()}
          >
            <Expander expanded={expanded() ?? false} />
            {rest.label}
            <span class="tsrd-explorer-info">
              {String(type).toLowerCase() === 'iterable' ? '(Iterable) ' : ''}
              {subEntries().length} {subEntries().length > 1 ? `items` : `item`}
            </span>
          </button>
          {(expanded() ?? false) ? (
            subEntryPages().length === 1 ? (
              <div class="tsrd-explorer-sub-entries">
                {subEntries().map((entry, index) => handleEntry(entry))}
              </div>
            ) : (
              <div class="tsrd-explorer-sub-entries">
                {subEntryPages().map((entries, index) => {
                  return (
                    <div>
                      <div class="tsrd-explorer-entry">
                        <button
                          class={`${'tsrd-explorer-label-button'} labelButton`}
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
                          <div class="tsrd-explorer-sub-entries">
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
                class="tsrd-explorer-refresh-value-btn"
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
          <span class="tsrd-explorer-value">{displayValue(value())}</span>
        </>
      )}
    </div>
  )
}
