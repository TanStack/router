/**
 * The Start compiler test kit of the fast tier, on the public Start host
 * (`./start-host`: `tanstackStart()` of the built framework package in a
 * real Vite dev server, a real Chromium page for client code, Start's real
 * server entry and request context for server code). Tests write the
 * modules a user writes (a case of the app: `module.tsx` and the files it
 * imports, all real files) and observe what a user observes:
 *
 * - what a page that imports the module gets and loads (`StartCase.client`,
 *   `StartCase.loads`), and what calling a server fn there does: Start's
 *   client RPC sends its request to the dev server, whose server entry runs
 *   the handler (`callFromClient`);
 * - what server code gets: the module evaluated by the SSR environment
 *   (`StartCase.ssr`), and server fns called inside a real request
 *   (`callOnServer`);
 * - what an environment serves (`StartCase.served`, for shipped-text checks
 *   such as a server-only marker string) and the compile error it throws
 *   (`compileError`, judged with `./diagnostics`).
 *
 * Nothing here names a compiler internal: no compiler class, module id or
 * query, provider module, server-fn report, emitted helper specifier or
 * runtime-internal property. A server fn is found the way an app finds it
 * (an export, or what the app's code returns) and identified by its public
 * `url`.
 */
import { parseSync } from 'vite'
import { expect } from 'vitest'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { ClientRun, StartCase, StartHost } from './start-host'

export {
  casesDir,
  createStartHost,
  expectNoPageErrors,
  pagePrelude,
  startPluginFactory,
  useStartHost,
  useStartHosts,
} from './start-host'
export type {
  ClientRun,
  StartCase,
  StartFramework as Framework,
  StartFramework,
  StartHost,
  StartHostBuild,
  StartHostOptions,
  StartPreview,
  StartPluginOptions,
} from './start-host'
export {
  expectCompileError,
  expectNoClientHandler,
  expectSourceError,
  serverOnlyModule,
  throwsError,
} from './diagnostics'
export type { MisplacementOptions } from './diagnostics'

/** The case file a test's module is written to, by default. */
export const moduleFile = 'module.tsx'

/**
 * What `settle` gives for a call that throws: the thrown value itself, so
 * oracles (`throwsError`) read the real error, and a
 * value the call returns is never mistaken for a throw.
 */
export class Thrown {
  constructor(readonly error: unknown) {}
}

/**
 * What calling `run` gives: its value, or `Thrown` with the error it
 * throws. A `run` that is no function is given back as it is, never a
 * `Thrown`: "calling it throws" needs a function (J4.10).
 */
export function settle(run: unknown) {
  if (typeof run !== 'function') {
    return run
  }
  try {
    return run()
  } catch (error) {
    return new Thrown(error)
  }
}

/**
 * The value `run` resolves to, or `Thrown` with the error it throws or
 * rejects with.
 */
export async function settleAsync(run: () => unknown) {
  try {
    return await run()
  } catch (error) {
    return new Thrown(error)
  }
}

/** What the page's `settle` gave (`pagePrelude`). */
export type PageSettled =
  | { value: unknown }
  | { thrown: { name?: string; message: string } }

/**
 * A page `settle` result as the test reads it: the value, or a `Thrown`
 * with an `Error` of the page error's name and message.
 */
export function fromPage(settled: PageSettled): unknown {
  if ('thrown' in settled) {
    const error = new Error(settled.thrown.message)
    if (settled.thrown.name) {
      error.name = settled.thrown.name
    }
    return new Thrown(error)
  }
  return settled.value
}

/**
 * An environment's refusal to serve a module (`file`, its absolute path):
 * the error it threw, and what the app reported on every channel meanwhile
 * (a compiler may give its explanation on the console or the dev server's
 * logger and hand the bundler a short error, SPEC §5.7, N15).
 * `expectCompileError` reads both.
 */
export class CompileFailure extends Error {
  constructor(
    readonly error: unknown,
    readonly reported: Array<ChannelDiagnostic>,
    readonly file: string,
  ) {
    super(error instanceof Error ? error.message : String(error), {
      cause: error,
    })
    this.name = 'CompileFailure'
  }
}

/**
 * The failure of an environment (default `client`) to serve a case file
 * (default `module.tsx`): a `CompileFailure` (the error it threw and the
 * warnings and errors the app reported on any channel while it tried), or
 * `undefined` when it serves the file.
 */
export async function compileError(
  startCase: StartCase,
  environment: 'client' | 'ssr' = 'client',
  file = moduleFile,
): Promise<CompileFailure | undefined> {
  const mark = startCase.diagnostics().length
  try {
    await startCase.served(file, environment)
    return undefined
  } catch (error) {
    return new CompileFailure(
      error,
      startCase
        .diagnostics()
        .slice(mark)
        .filter((diagnostic) => diagnostic.severity !== 'info'),
      startCase.file(file),
    )
  }
}

/** A case whose module every environment served and evaluated. */
export interface ServedCase extends StartCase {
  /** What each environment serves for the module. */
  code: { client: string; ssr: string }
}

/**
 * Writes a case of the app (`files`, by path relative to the case
 * directory; the module under test is `module.tsx` unless `file` says
 * otherwise) and checks that it is a working module everywhere: the client
 * and SSR environments serve it, the SSR environment evaluates it, and a
 * page imports it without an error. Returns the case with the served code.
 */
export async function serveCase(
  host: StartHost,
  files: Record<string, string>,
  options: { file?: string } = {},
): Promise<ServedCase> {
  const file = options.file ?? moduleFile
  const startCase = await host.case(files)
  const client = await startCase.served(file, 'client')
  const ssr = await startCase.served(file, 'ssr')
  await startCase.ssr(file)
  const run = await startCase.client('return true', { file })
  expect(run.errors, `page errors importing ${file}`).toEqual([])
  return { ...startCase, code: { client, ssr } }
}

/** `data` as a JavaScript expression of a page script. */
function dataExpression(data: unknown) {
  return data === undefined ? 'undefined' : JSON.stringify(data)
}

/**
 * Calls a server fn from the client the way an app does: in the host's page,
 * `fn` (a JavaScript expression with the case module as `module`, e.g.
 * `module.getUser` or `module.api.read`) is called with `{ data }`; Start's
 * client runtime sends its request to the dev server, whose server entry
 * runs the handler. Gives what the call resolves to (JSON), or throws an
 * `Error` with the page error's name and message.
 */
export async function callFromClient(
  startCase: StartCase,
  fn: string,
  data?: unknown,
  options: { file?: string } = {},
): Promise<unknown> {
  const run = await startCase.client<PageSettled>(
    `const fn = ${fn}
if (typeof fn !== 'function') {
  throw new Error(${JSON.stringify(`${fn} is not a function on the client`)} + ': ' + typeof fn)
}
return settle(() => fn({ data: ${dataExpression(data)} }))`,
    options,
  )
  const result = fromPage(run.result)
  if (result instanceof Thrown) {
    throw result.error
  }
  return result
}

/** `read` (a JavaScript expression with the module as `module`) in Node. */
function readExpression(expression: string) {
  return new Function('module', `return (${expression})`) as (
    module: Record<string, any>,
  ) => unknown
}

/**
 * Calls a server fn from server code the way an app does: inside a real
 * request of the app (`StartCase.inRequest`), `fn` (the same expression as
 * for `callFromClient`, read from the module the SSR environment evaluated)
 * is called with `{ data }`. Gives what it resolves to, or throws what it
 * throws.
 */
export async function callOnServer(
  startCase: StartCase,
  fn: string,
  data?: unknown,
  options: { file?: string } = {},
): Promise<unknown> {
  const module = await startCase.ssr(options.file)
  const server = readExpression(fn)(module)
  expect(server, `${fn} on the server`).toBeTypeOf('function')
  return startCase.inRequest(() =>
    (server as (options: { data?: unknown }) => unknown)({ data }),
  )
}

/**
 * Calls a server fn the way the app does, from both sides: from the client
 * (`callFromClient`: the request reaches the handler through the server
 * entry) and from server code (`callOnServer`), and checks that both give
 * the same result, which it returns.
 */
export async function callServerFnThroughCallers(
  startCase: StartCase,
  fn: string,
  data?: unknown,
  options: { file?: string } = {},
): Promise<unknown> {
  const client = await callFromClient(startCase, fn, data, options)
  const server = await callOnServer(startCase, fn, data, options)
  expect(server, `${fn} called by server code`).toEqual(client)
  return client
}

/**
 * The distinct `url`s of the server fns among the values of `namespace` (a
 * JavaScript expression of the page, default the case module's namespace):
 * how many server fns a module gives its importers, by their public
 * identity.
 */
export async function serverFnUrls(
  startCase: StartCase,
  namespace = 'module',
  options: { file?: string } = {},
): Promise<Array<string>> {
  const run = await startCase.client<Array<string>>(
    `return serverFnUrls(${namespace})`,
    options,
  )
  return run.result
}

/** Runs a page script and returns its JSON result (`StartCase.client`). */
export async function inPage<T = unknown>(
  startCase: StartCase,
  script: string,
  options: { file?: string } = {},
): Promise<T> {
  const run: ClientRun<T> = await startCase.client<T>(script, options)
  return run.result
}

/** The directives of a module's directive prologue, in order. */
export function directivePrologue(code: string) {
  const { program } = parseSync('module.tsx', code, { sourceType: 'module' })
  const directives: Array<string> = []
  for (const statement of program.body) {
    if (
      statement.type !== 'ExpressionStatement' ||
      !('directive' in statement) ||
      typeof statement.directive !== 'string'
    ) {
      break
    }
    directives.push(statement.directive)
  }
  return directives
}
