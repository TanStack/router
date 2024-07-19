import crypto from 'crypto'
import { createServerFn } from '@tanstack/start'
import invariant from 'tiny-invariant'
import {
  columnSchema,
  deleteColumnSchema,
  deleteItemSchema,
  itemSchema,
  newColumnSchema,
  updateBoardSchema,
  updateColumnSchema,
} from './schema'
import type { Board, Item } from './schema'
import type { z } from 'zod'

const DELAY = 1000

const boards: Array<Board> = [
  {
    id: '1',
    name: 'First board',
    color: '#e0e0e0',
    columns: [],
    items: [],
  },
]

const delay = (ms: number = 1000) =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const getBoards = createServerFn('GET', async () => {
  await delay(DELAY)
  return boards
})

export const getBoard = createServerFn('GET', async (boardId: string) => {
  await delay(DELAY)
  const board = boards.find((b) => b.id === boardId)
  invariant(board, 'missing board')
  return board
})

export const createColumn = createServerFn(
  'POST',
  async (payload: z.infer<typeof newColumnSchema>) => {
    await delay(DELAY)
    const newColumn = newColumnSchema.parse(payload)

    const board = boards.find((b) => b.id === newColumn.boardId)

    invariant(board, 'missing board')

    board.columns = [
      ...board.columns,
      {
        ...newColumn,
        order: board.columns.length + 1,
        id: crypto.randomUUID(),
      },
    ]
  },
)

export const createItem = createServerFn(
  'POST',
  async (payload: z.infer<typeof itemSchema>) => {
    await delay(DELAY)
    const item = itemSchema.parse(payload)

    const board = boards.find((b) => b.id === item.boardId)

    invariant(board, 'missing board')

    board.items.push(item)
  },
)

export const deleteItem = createServerFn(
  'GET',
  async (payload: z.infer<typeof deleteItemSchema>) => {
    await delay(DELAY)
    const { id } = deleteItemSchema.parse(payload)
    const board = boards.find((b) => b.items.some((i) => i.id === id))
    invariant(board, 'missing board')
    board.items = board.items.filter((item) => item.id !== id)
  },
)

export const updateItem = createServerFn(
  'POST',
  async (payload: z.infer<typeof itemSchema>) => {
    await delay(DELAY)
    const item = itemSchema.parse(payload)
    const board = boards.find((b) => b.id === item.boardId)
    invariant(board, 'missing board')
    const existingItem = board.items.find((i) => i.id === item.id)
    invariant(existingItem, 'missing item')
    Object.assign(existingItem, item)
  },
)

export const updateColumn = createServerFn(
  'POST',
  async (payload: z.infer<typeof updateColumnSchema>) => {
    await delay(DELAY)
    const column = updateColumnSchema.parse(payload)
    const board = boards.find((b) => b.id === column.boardId)
    invariant(board, 'missing board')
    const existingColumn = board.columns.find((c) => c.id === column.id)
    invariant(existingColumn, 'missing column')
    Object.assign(existingColumn, column)
  },
)

export const updateBoard = createServerFn(
  'POST',
  async (payload: z.infer<typeof updateBoardSchema>) => {
    await delay(DELAY)
    const update = updateBoardSchema.parse(payload)
    const board = boards.find((b) => b.id === update.id)
    invariant(board, 'missing board')
    Object.assign(board, update)
  },
)

export const deleteColumn = createServerFn(
  'GET',
  async (payload: z.infer<typeof deleteColumnSchema>) => {
    await delay(DELAY)
    const { id } = deleteColumnSchema.parse(payload)
    const board = boards.find((b) => b.columns.some((c) => c.id === id))
    invariant(board, 'missing board')
    board.columns = board.columns.filter((column) => column.id !== id)
    board.items = board.items.filter((item) => item.columnId !== id)
  },
)
