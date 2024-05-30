import { useState, useCallback, useRef, forwardRef } from 'react'
import invariant from 'tiny-invariant'

import { INTENTS, type RenderedItem, CONTENT_TYPES } from '../types'
import { flushSync } from 'react-dom'
import { EditableText } from './EditableText'
import { Icon } from '../icons/icons'
import { NewCard } from './NewCard'
import { Card } from './Card'
import { useMoveCardMutation } from '../queries'

interface ColumnProps {
  name: string
  boardId: number
  columnId: string
  items: RenderedItem[]
}

export const Column = forwardRef<HTMLDivElement, ColumnProps>(
  ({ name, columnId, boardId, items }, ref) => {
    const [acceptDrop, setAcceptDrop] = useState(false)
    const [edit, setEdit] = useState(false)
    const itemRef = useCallback((node: HTMLElement | null) => {
      node?.scrollIntoView()
    }, [])

    const listRef = useRef<HTMLUListElement>(null!)

    function scrollList() {
      invariant(listRef.current)
      listRef.current.scrollTop = listRef.current.scrollHeight
    }

    const moveCard = useMoveCardMutation()

    return (
      <div
        ref={ref}
        className={
          'flex-shrink-0 flex flex-col overflow-hidden max-h-full w-80 border-slate-400 rounded-xl shadow-sm shadow-slate-400 bg-slate-100 ' +
          (acceptDrop ? `outline outline-2 outline-brand-red` : ``)
        }
        onDragOver={(event) => {
          if (
            items.length === 0 &&
            event.dataTransfer.types.includes(CONTENT_TYPES.card)
          ) {
            event.preventDefault()
            setAcceptDrop(true)
          }
        }}
        onDragLeave={() => {
          setAcceptDrop(false)
        }}
        onDrop={(event) => {
          const transfer = JSON.parse(
            event.dataTransfer.getData(CONTENT_TYPES.card)
          )
          invariant(transfer.id, 'missing transfer.id')
          invariant(transfer.title, 'missing transfer.title')

          moveCard.mutate({
            order: 1,
            columnId: columnId,
            boardId,
            id: transfer.id,
            title: transfer.title,
          })

          setAcceptDrop(false)
        }}
      >
        <div className="p-2">
          <EditableText
            fieldName="name"
            value={name}
            inputLabel="Edit column name"
            buttonLabel={`Edit column "${name}" name`}
            inputClassName="border border-slate-400 w-full rounded-lg py-1 px-2 font-medium text-black"
            buttonClassName="block rounded-lg text-left w-full border border-transparent py-1 px-2 font-medium text-slate-600"
          >
            <input type="hidden" name="intent" value={INTENTS.updateColumn} />
            <input type="hidden" name="id" value={columnId} />
          </EditableText>
        </div>

        <ul ref={listRef} className="flex-grow overflow-auto">
          {[...items]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((item, index, items) => (
              <Card
                ref={itemRef}
                key={item.id}
                title={item.title}
                content={item.content ?? ''}
                id={item.id}
                boardId={boardId}
                order={item.order}
                columnId={columnId}
                previousOrder={items[index - 1] ? items[index - 1].order : 0}
                nextOrder={
                  items[index + 1] ? items[index + 1].order : item.order + 1
                }
              />
            ))}
        </ul>
        {edit ? (
          <NewCard
            columnId={columnId}
            boardId={boardId}
            nextOrder={
              items.length === 0 ? 1 : items[items.length - 1].order + 1
            }
            onComplete={() => setEdit(false)}
          />
        ) : (
          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                flushSync(() => {
                  setEdit(true)
                })
                scrollList()
              }}
              className="flex items-center gap-2 rounded-lg text-left w-full p-2 font-medium text-slate-500 hover:bg-slate-200 focus:bg-slate-200"
            >
              <Icon name="plus" /> Add a card
            </button>
          </div>
        )}
      </div>
    )
  }
)
