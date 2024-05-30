import { useCallback, useRef } from 'react'
import invariant from 'tiny-invariant'
import { useSuspenseQuery } from '@tanstack/react-query'
import { boardQueries } from '../queries.js'
import { EditableText } from '~/components/EditableText.js'
import { NewColumn } from './NewColumn.js'
import { Column as ColumnComponent } from './Column.js'
import type { Column } from '../mocks/db.js'
import { INTENTS } from '../types.js'

export function Board() {
  const { data: board } = useSuspenseQuery(boardQueries.detail(1))

  // scroll right when new columns are added
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const columnRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      invariant(scrollContainerRef.current, 'no scroll container')
      scrollContainerRef.current.scrollLeft =
        scrollContainerRef.current.scrollWidth
    }
  }, [])

  const itemsById = new Map(board.items.map((item) => [item.id, item]))
  type ColumnWithItems = Column & { items: typeof board.items }
  const columns = new Map<string, ColumnWithItems>()
  for (const column of [...board.columns]) {
    columns.set(column.id, { ...column, items: [] })
  }

  // add items to their columns
  for (const item of itemsById.values()) {
    const columnId = item.columnId
    const column = columns.get(columnId)
    invariant(column, 'missing column')
    column.items.push(item)
  }

  return (
    <div
      className="h-full min-h-0 flex flex-col overflow-x-scroll"
      ref={scrollContainerRef}
      style={{ backgroundColor: board.color }}
    >
      <h1>
        <EditableText
          value={board.name}
          fieldName="name"
          inputClassName="mx-8 my-4 text-2xl font-medium border border-slate-400 rounded-lg py-1 px-2 text-black"
          buttonClassName="mx-8 my-4 text-2xl font-medium block rounded-lg text-left border border-transparent py-1 px-2 text-slate-800"
          buttonLabel={`Edit board "${board.name}" name`}
          inputLabel="Edit board name"
        >
          <input type="hidden" name="intent" value={INTENTS.updateBoardName} />
          <input type="hidden" name="id" value={board.id} />
        </EditableText>
      </h1>

      <div className="flex flex-grow min-h-0 h-full items-start gap-4 px-8 pb-4">
        {[...columns.values()].map((col) => {
          return (
            <ColumnComponent
              ref={columnRef}
              key={col.id}
              name={col.name}
              columnId={col.id}
              boardId={board.id}
              items={col.items}
            />
          )
        })}
        <NewColumn
          boardId={board.id}
          editInitially={board.columns.length === 0}
        />
      </div>

      {/* trolling you to add some extra margin to the right of the container with a whole dang div */}
      <div data-lol className="w-8 h-1 flex-shrink-0" />
    </div>
  )
}
