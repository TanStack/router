import * as t from '@babel/types'
import { describe, expect, it } from 'vitest'
import { getRouteOptionDeleteNodesForClient } from '../src/start-router-plugin/route-option-delete-nodes'
import type {
  DeleteNodeCallback,
  DeleteNodeCallbackContext,
} from '@tanstack/router-plugin'

function getClientDeleteNodeCallback(): DeleteNodeCallback {
  const callback = getRouteOptionDeleteNodesForClient(undefined).find(
    (deleteNode): deleteNode is DeleteNodeCallback =>
      typeof deleteNode === 'function',
  )

  if (!callback) {
    throw new Error('Expected a client delete node callback')
  }

  return callback
}

function createContext(
  prop: t.ObjectProperty | t.ObjectMethod,
  dotPath: string,
): DeleteNodeCallbackContext {
  return {
    key: 'dehydrate',
    path: dotPath.split('.'),
    dotPath,
    prop,
    parent: t.objectExpression([prop]),
  }
}

describe('Start route option delete nodes', () => {
  it('replaces custom dehydrate route options with a client marker', () => {
    const callback = getClientDeleteNodeCallback()
    const prop = t.objectMethod(
      'method',
      t.identifier('dehydrate'),
      [t.identifier('ctx')],
      t.blockStatement([]),
    )

    const result = callback(createContext(prop, 'loader.dehydrate'))

    expect(result).toMatchObject({ action: 'replace' })
    expect(
      result &&
        typeof result === 'object' &&
        'action' in result &&
        result.action === 'replace' &&
        t.isObjectProperty(result.node) &&
        t.isBooleanLiteral(result.node.value) &&
        result.node.value.value,
    ).toBe(true)
  })

  it('preserves boolean dehydrate route options on the client', () => {
    const callback = getClientDeleteNodeCallback()
    const prop = t.objectProperty(
      t.identifier('dehydrate'),
      t.booleanLiteral(false),
    )

    expect(callback(createContext(prop, 'loader.dehydrate'))).toBeUndefined()
  })
})
