import {
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import ky from 'ky'
import {
  Board,
  updateSchema,
  deleteItemSchema,
  newColumnSchema,
  itemSchema,
} from './mocks/db.js'
import { z } from 'zod'

export const boardQueries = {
  detail: (id: number) =>
    queryOptions({
      queryKey: ['board', id],
      queryFn: () => ky.get(`/board/${id}`).json<Board>(),
    }),
}

export function useNewColumnMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (json: z.infer<typeof newColumnSchema>) =>
      ky.post('/board/newColumn', { json }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries()
      queryClient.setQueryData(
        boardQueries.detail(variables.boardId).queryKey,
        (board) =>
          board
            ? {
                ...board,
                columns: [
                  ...board.columns,
                  { ...variables, order: board.columns.length + 1 },
                ],
              }
            : undefined
      )
    },
  })
}

export function useNewCardMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (json: z.infer<typeof itemSchema>) =>
      ky.post('/board/newItem', { json }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries()
      queryClient.setQueryData(
        boardQueries.detail(variables.boardId).queryKey,
        (board) =>
          board
            ? {
                ...board,
                items: [...board.items, variables],
              }
            : undefined
      )
    },
  })
}

export function useMoveCardMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (json: z.infer<typeof itemSchema>) =>
      ky.post('/board/moveItem', { json }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries()
      queryClient.setQueryData(
        boardQueries.detail(variables.boardId).queryKey,
        (board) =>
          board
            ? {
                ...board,
                items: board.items.map((i) =>
                  i.id === variables.id ? variables : i
                ),
              }
            : undefined
      )
    },
  })
}

export function useDeleteCardMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (json: z.infer<typeof deleteItemSchema>) =>
      ky.post('/board/deleteItem', { json }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries()

      queryClient.setQueryData(
        boardQueries.detail(variables.boardId).queryKey,
        (board) =>
          board
            ? {
                ...board,
                items: board.items.filter((item) => item.id !== variables.id),
              }
            : undefined
      )
    },
  })
}

export function useUpdateMutation() {
  return useMutation({
    mutationFn: (json: z.infer<typeof updateSchema>) =>
      ky.post('/board/update', { json }),
  })
}
