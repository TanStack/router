import { describe, expect, test } from 'vitest'
import { mergeServerFnsById } from '../src/start-compiler/host'
import type { ServerFn } from '../src/start-compiler/types'

describe('mergeServerFnsById', () => {
  test('replaces a stale ID for the same server function', () => {
    const serverFnsById: Record<string, ServerFn> = {
      'old-id': {
        functionId: 'old-id',
        functionName: 'getUser_createServerFn_handler',
        filename: '/src/users.ts',
        extractedFilename: '/src/users.ts?tss-serverfn-split',
      },
    }

    mergeServerFnsById(serverFnsById, {
      'new-id': {
        functionId: 'new-id',
        functionName: 'getUser_createServerFn_handler',
        filename: '/src/users.ts',
        extractedFilename: '/src/users.ts?tss-serverfn-split',
      },
    })

    expect(serverFnsById).toEqual({
      'new-id': {
        functionId: 'new-id',
        functionName: 'getUser_createServerFn_handler',
        filename: '/src/users.ts',
        extractedFilename: '/src/users.ts?tss-serverfn-split',
      },
    })
  })

  test('merges client references reported by multiple environments', () => {
    const serverFnsById: Record<string, ServerFn> = {
      'get-user': {
        functionId: 'get-user',
        functionName: 'getUser_createServerFn_handler',
        filename: '/src/users.ts',
        extractedFilename: '/src/users.ts?tss-serverfn-split',
        isClientReferenced: false,
      },
    }

    mergeServerFnsById(serverFnsById, {
      'get-user': {
        functionId: 'get-user',
        functionName: 'getUser_createServerFn_handler',
        filename: '/src/users.ts',
        extractedFilename: '/src/users.ts?tss-serverfn-split',
        isClientReferenced: true,
      },
    })

    expect(serverFnsById['get-user']?.isClientReferenced).toBe(true)
  })
})
