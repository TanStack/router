/**
 * Compiling the Start compiler's own output again changes nothing a user can
 * observe: the recompiled module is valid and evaluates like the output it
 * was compiled from (no implementation is replaced twice, no import is
 * duplicated). Asserted by evaluation, not by the printed code.
 * Source: oracle-gaps M4 (round 2).
 */
import { expect, test } from 'vitest'
import {
  clientOnlyError,
  compileCode,
  evaluateModule,
  serverOnlyError,
  settle,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { ModuleStub, RuntimeEnv } from './regression-helpers'

const envFunctions = `import { createMiddleware, createIsomorphicFn, createServerOnlyFn, createClientOnlyFn } from '@tanstack/react-start'
import { ClientOnly } from '@tanstack/react-router'
import { db } from './db.server'
import { chart } from './chart.client'
export const auth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => next())
  .server(async ({ next }) => next({ context: { user: db.user() } }))
export const where = createIsomorphicFn()
  .server(() => db.where())
  .client(() => chart())
export const secret = createServerOnlyFn(() => db.secret())
export const draw = createClientOnlyFn(() => chart())
export const Page = () => (
  <ClientOnly fallback={<p>loading</p>}>
    <b>{chart()}</b>
  </ClientOnly>
)`

const stubs = (env: RuntimeEnv): Record<string, ModuleStub> => ({
  '@tanstack/react-router': {
    ClientOnly: (props: { children?: string; fallback?: string }) =>
      (env === 'server' ? props.fallback : props.children) ?? '',
  },
  './db.server': {
    db: {
      user: () => 'user',
      where: () => 'server',
      secret: () => 'secret',
    },
  },
  './chart.client': { chart: () => 'chart' },
})

/** What an evaluated output of `envFunctions` does. */
function observe(module: Record<string, any>) {
  return {
    auth: Object.keys(module.auth.options).sort(),
    where: module.where(),
    secret: settle(module.secret),
    draw: settle(module.draw),
    page: module.Page(),
  }
}

test.each([
  {
    output: 'client',
    env: 'client',
    expected: {
      auth: ['client', 'type'],
      where: 'chart',
      secret: serverOnlyError,
      draw: 'chart',
      page: '<b>chart</b>',
    },
  },
  {
    output: 'ssr',
    env: 'server',
    expected: {
      auth: ['client', 'server', 'type'],
      where: 'server',
      secret: 'secret',
      draw: clientOnlyError,
      page: '<p>loading</p>',
    },
  },
] as const)(
  '$output: env-specific functions compiled again evaluate the same',
  async ({ output, env, expected }) => {
    const once = (await compileCode(output, envFunctions)) ?? envFunctions
    const twice = (await compileCode(output, once)) ?? once
    expect(await getModuleErrors(twice)).toEqual([])
    const evaluate = async (code: string) =>
      observe(await evaluateModule(code, stubs(env), { env }))
    expect(await evaluate(once)).toEqual(expected)
    expect(await evaluate(twice)).toEqual(expected)
  },
)
