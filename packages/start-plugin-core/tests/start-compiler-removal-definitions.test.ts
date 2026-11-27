import { describe, test } from 'vitest'
import { useStartHost } from './regression-helpers'
import { SF, SO, checkRow } from './removal-cases'
import type { Row } from './removal-cases'

// What the dead-code removal takes from the definitions below the top level:
// a function's locals, the leaves of patterns, parameters' defaults. A
// definition leaves by its grammar slot or is emptied in place; one that reads
// itself while it is initialised is a statement and stays.
// The rows and how they are checked: `./removal-cases`.

const host = useStartHost()
const check = async (row: Row) => checkRow(await host(), row)

// A parameter that is a name with a default keeps its place: when every read of it
// is removed, a default that reads or calls anything becomes `void 0` and a
// literal one stays, so `length` and the argument positions do not change. A
// parameter the function's body declares again (`var`, a function declaration)
// starts the body's binding with its value: it stays. A TypeScript parameter
// property is read by its class.
describe('a plain parameter', () => {
  test.each<Row>([
    {
      // D4_plain_param_reading_default
      name: 'a default that calls server code leaves; length unchanged',
      code: `${SO}import { getServerDb } from './db.server'
export function make(db = getServerDb()) { return createServerOnlyFn(() => db.query()) }
export const run = () => [make.length, typeof make()]
`,
      expected: { value: [0, 'function'] },
      gone: true,
    },
    {
      // D4_plain_param_after_required_one
      name: 'a default after a required parameter leaves',
      code: `${SO}import { getServerDb } from './db.server'
export const make = (a: number, db = getServerDb()) => createServerOnlyFn(() => [a, db.query()])
export const run = () => [make.length, typeof make(1)]
`,
      expected: { value: [1, 'function'] },
      gone: true,
    },
    {
      // D4_plain_param_literal_default_stays
      name: 'literal defaults stay beside one that leaves',
      code: `${SO}import { getServerDb } from './db.server'
export function make(label = 'x', n = 1, db = getServerDb()) { return createServerOnlyFn(() => [label, n, db]) }
export const run = () => make.length
`,
      expected: { value: 0 },
      gone: true,
    },
    {
      // D4_plain_param_method
      name: "a method's parameter default leaves",
      code: `${SO}import { getServerDb } from './db.server'
export const api = { make(db = getServerDb()) { return createServerOnlyFn(() => db) } }
export const run = () => api.make.length
`,
      expected: { value: 0 },
      gone: true,
    },
    {
      // D5_param_default_with_type_assertion
      name: 'a default behind a type assertion naming server code leaves',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
export function make(x = null as unknown as typeof db) { return createServerOnlyFn(() => [x, db]) }
export const run = () => make.length
`,
      expected: { value: 0 },
      gone: true,
    },
    {
      // D5_param_not_redeclared_still_goes
      name: 'a default only erased code reads through a closure leaves',
      code: `${SO}import { getServerDb } from './db.server'
function configure(options = getServerDb(), audit = () => options) {
  const serverAudit = createServerOnlyFn(() => audit())
  return 1
}
export const run = () => [configure.length, configure()]
`,
      expected: { value: [0, 1] },
      gone: true,
    },
    {
      // D4_plain_param_kept_read_stays
      name: 'a default kept code reads stays',
      code: `${SO}import { getServerDb } from './db.server'
export function make(db = getServerDb()) { return [typeof db, createServerOnlyFn(() => db.query())] }
export const run = () => make()[0]
`,
      expected: { value: 'object' },
    },
    {
      // D4_parameter_property_stays
      name: "a parameter property's default stays (the class reads it)",
      code: `${SO}import { getServerDb } from './db.server'
export class Repo {
  q: unknown
  constructor(private db = getServerDb()) { this.q = createServerOnlyFn(() => db.query()) }
  kind() { return typeof this.db }
}
export const run = () => new Repo().kind()
`,
      expected: { value: 'object' },
    },
    {
      // D4_plain_param_self_default_stays
      name: 'a default that reads its own parameter stays and throws',
      code: `${SO}import { getServerVal } from './db.server'
export function make(a = a) { return createServerOnlyFn(() => [a, getServerVal()]) }
export const run = () => { try { make() } catch (e) { return (e as Error).name } }
`,
      expected: { value: 'ReferenceError' },
      gone: true,
    },
    {
      // D5_param_redeclared_by_body_var
      name: 'a parameter the body declares again with var keeps its default',
      code: `${SO}function readOptions() { return { locale: 'fr' } }
function configure(options = readOptions(), audit = () => options) {
  var options: { locale: string }
  const serverAudit = createServerOnlyFn(() => audit())
  return options.locale
}
export const run = () => configure()
`,
      expected: { value: 'fr' },
    },
    {
      // D5_pattern_param_leaf_redeclared_by_body_var
      name: 'a pattern parameter leaf the body declares again keeps its default',
      code: `${SO}function readOptions() { return { locale: 'fr' } }
function configure({ locale } = readOptions(), audit = () => locale) {
  var locale: string
  const serverAudit = createServerOnlyFn(() => audit())
  return locale
}
export const run = () => configure()
`,
      expected: { value: 'fr' },
    },
  ])('$name', check)
})

// A binding of a pattern only removed code read leaves; what the pattern does
// for the bindings that stay is unchanged. A dead position leaves a pattern that
// stays (D8 B); beside a rest element that stays it is emptied, and a default
// of an emptied pattern becomes `{}` or `[]` (D8d A): a missing value is still
// destructured, a `null` still throws where the source throws. A rest element
// is code of its own: it keeps its declarator (D2 B); a plain never-read name
// leaves with its declarator.
describe('destructuring patterns', () => {
  test.each<Row>([
    {
      // R2_plain_sibling_goes
      name: 'a never-read sibling leaves with its declarator',
      code: `${SO}import { getServerObj } from './db.server'
export function run() {
  const { unused, secret } = getServerObj()
  const f = createServerOnlyFn(() => secret)
  return 1
}
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // M2_local_inert_unused_sibling_goes
      name: 'a never-read sibling of a local leaves with its declarator',
      code: `${SO}import { getServerObj } from './db.server'
export function run() {
  const { unused, secret } = getServerObj()
  const f = createServerOnlyFn(() => secret)
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // M2_type_only_reference_sibling
      name: 'a sibling only a type names leaves with its declarator',
      code: `${SO}import { getServerObj } from './db.server'
export function run() {
  const { unused, secret } = getServerObj()
  type U = typeof unused
  const f = createServerOnlyFn(() => secret as U)
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // R1_object_rest_copy_pins
      name: 'a never-read object rest element keeps its copy',
      code: `${SO}import { getServerObj } from './db.server'
export function run() {
  let n = 0
  const { x, ...unused } = { get g() { return ++n }, x: getServerObj() } as any
  const f = createServerOnlyFn(() => x)
  return n
}
`,
      expected: { value: 1 },
    },
    {
      // R1_array_rest_drain_pins
      name: 'a never-read array rest element keeps draining the iterator',
      code: `${SO}import { getServerObj } from './db.server'
export function run() {
  let n = 0
  function* seq() { n++; yield getServerObj(); n++; yield 2; n++ }
  const [x, ...unused] = seq()
  const f = createServerOnlyFn(() => x)
  return n
}
`,
      expected: { value: 3 },
    },
    {
      // M2_local_effectful_unused_sibling
      name: "a sibling's default with an effect still runs",
      code: `${SO}import { record, steps, getters } from './record'
import { getServerDefault } from './db.server'
export function run() {
  let n = 0
  const { unused = ++n, x = getServerDefault() } = {} as any
  const f = createServerOnlyFn(() => x)
  return [n, typeof f]
}
`,
      expected: { value: [1, 'function'] },
      gone: true,
    },
    {
      // M2_top_effectful_unused_sibling
      name: "a top-level sibling's default with an effect still runs",
      code: `${SF}import { record, steps, getters } from './record'
import { getServerDefault } from './db.server'
const { unused = record('unused-default'), x = getServerDefault() } = {} as any
export const fn = createServerFn().handler(async () => x)
export const run = () => 1
`,
      expected: { value: 1, calls: ['unused-default'] },
      gone: true,
    },
    {
      // M2_bindingless_sibling_alone_still_throws
      name: 'a sibling pattern that binds nothing still throws on a missing value',
      code: `${SO}import { getServerDefault } from './db.server'
function take(cfg: any) {
  const { must: {}, srv = getServerDefault() } = cfg
  return typeof createServerOnlyFn(() => srv)
}
export function run() {
  const out: Array<any> = [take({ must: {} })]
  try { out.push(take({})) } catch (e: any) { out.push(e.name) }
  return out
}
`,
      expected: { value: ['function', 'TypeError'] },
      gone: true,
    },
    {
      // K1_nested_pattern_of_kept_pattern_valid
      name: 'a dead nested position of a pattern that stays leaves',
      code: `${SO}import { getServerVal } from './db.server'
export function run() {
  const { a: { x }, b } = { a: { x: 1 }, b: 2 } as any
  const f = createServerOnlyFn(() => [x, getServerVal()])
  return b
}
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // K2_literal_default_stays_valid
      name: "an emptied position beside a rest element keeps the rest's keys",
      code: `${SO}import { getServerVal } from './db.server'
export function run() {
  const { n: { x } = { x: 1 }, ...r } = { k: 2 } as any
  const f = createServerOnlyFn(() => [x, getServerVal()])
  return r
}
`,
      expected: { value: { k: 2 } },
      gone: true,
    },
    {
      // P4_dead_literal_default_payload_declarator
      name: 'a dead literal default leaves no field in the client',
      code: `${SO}export function run() {
  const { db: { token } = { token: 'SERVER_PAYLOAD_CHECK' }, theme } = { theme: 'dark' } as any
  const f = createServerOnlyFn(() => token)
  return theme
}
`,
      expected: { value: 'dark' },
      absent: 'SERVER_PAYLOAD_CHECK',
    },
    {
      // P4_dead_literal_default_payload_beside_rest
      name: 'a dead literal default beside a rest element leaves no field in the client',
      code: `${SO}export function run() {
  const { db: { token } = { token: 'SERVER_PAYLOAD_CHECK' }, ...rest } = { theme: 'dark' } as any
  const f = createServerOnlyFn(() => token)
  return rest
}
`,
      expected: { value: { theme: 'dark' } },
      absent: 'SERVER_PAYLOAD_CHECK',
    },
    {
      // P4_dead_literal_default_payload_parameter
      name: 'a dead literal parameter default leaves no field in the client',
      code: `${SO}function inner({ token } = { token: 'SERVER_PAYLOAD_CHECK' }) { return createServerOnlyFn(() => token) }
export const run = () => [inner.length, typeof inner()]
`,
      expected: { value: [0, 'function'] },
      absent: 'SERVER_PAYLOAD_CHECK',
    },
    {
      // P5_repeated_keys_beside_rest
      name: 'repeated keys beside a rest element',
      code: `${SO}export function run() {
  const { a: [x], a: { y }, ...rest } = { a: [], k: 2 } as any
  const f = createServerOnlyFn(() => [x, y])
  return rest
}
`,
      expected: { value: { k: 2 } },
    },
    {
      // P5_repeated_proto_keys
      name: 'repeated __proto__ keys beside a rest element',
      code: `${SO}export function run() {
  const { __proto__: a, __proto__: b, ...rest } = { k: 2 } as any
  const f = createServerOnlyFn(() => [a, b])
  return rest
}
`,
      expected: { value: { k: 2 } },
    },
    {
      // M3_rest_nested_default_missing_null_present
      name: 'a server default beside a rest element: missing, present and null values',
      code: `${SO}import { getServerDefault } from './db.server'
function take(cfg: any) {
  const { n: { x } = getServerDefault(), ...rest } = cfg
  const f = createServerOnlyFn(() => x)
  return [Object.keys(rest), typeof f]
}
export function run() {
  const out: Array<any> = [take({ k: 1 }), take({ n: { x: 1 }, k: 2 })]
  try { take({ n: null, k: 3 }) } catch (e: any) { out.push(e.name) }
  return out
}
`,
      expected: {
        value: [[['k'], 'function'], [['k'], 'function'], 'TypeError'],
      },
      gone: true,
    },
    {
      // M3_rest_nested_array_default
      name: "an array pattern's server default beside a rest element",
      code: `${SO}import { getServerDefault } from './db.server'
function take(cfg: any) {
  const { n: [a, b] = [getServerDefault()] as any, ...rest } = cfg
  const f = createServerOnlyFn(() => [a, b])
  return [Object.keys(rest), typeof f]
}
export function run() {
  const out: Array<any> = [take({ k: 1 }), take({ n: [1, 2], k: 2 })]
  try { take({ n: 5 }) } catch (e: any) { out.push(e.name) }
  return out
}
`,
      expected: {
        value: [[['k'], 'function'], [['k'], 'function'], 'TypeError'],
      },
      gone: true,
    },
    {
      // M3_array_rest_nested_pattern_default
      name: 'a server default inside an array rest element: the iterator steps as before',
      code: `${SO}import { record, steps, getters } from './record'
import { getServerDefault } from './db.server'
export function run() {
  const it = steps(3)
  const [first, ...[second = getServerDefault(), third]] = it
  const f = createServerOnlyFn(() => [second, third])
  return [first, typeof f]
}
`,
      expected: {
        value: [0, 'function'],
        calls: ['next', 'next', 'next', 'next'],
      },
      gone: true,
    },
    {
      // G4_param_pattern_all_dead_with_outer_default
      name: 'a parameter pattern and its default, both reading server code',
      code: `${SO}import { getServerDefault } from './db.server'
export function Comp({ a = getServerDefault() } = getServerDefault()) {
  return createServerOnlyFn(() => a)
}
export const run = () => [Comp.length, typeof Comp(), typeof Comp({})]
`,
      expected: { value: [0, 'function', 'function'] },
      gone: true,
    },
    {
      // G4_param_array_pattern_all_dead_with_outer_default
      name: 'an array parameter pattern and its default, both reading server code',
      code: `${SO}import { getServerDefault } from './db.server'
export function Comp([a = getServerDefault(), b] = [getServerDefault()] as any) {
  return createServerOnlyFn(() => [a, b])
}
export const run = () => [Comp.length, typeof Comp(), typeof Comp([1])]
`,
      expected: { value: [0, 'function', 'function'] },
      gone: true,
    },
    {
      // M3_for_of_head_pattern
      name: "a for\u2026of head's server default",
      code: `${SO}import { getServerDefault } from './db.server'
export function run() {
  const out: Array<any> = []
  for (const { a = getServerDefault(), b } of [{ b: 1 }, { b: 2 }] as Array<any>) {
    out.push(b, typeof createServerOnlyFn(() => a))
  }
  return out
}
`,
      expected: { value: [1, 'function', 2, 'function'] },
      gone: true,
    },
    {
      // M3_catch_pattern_with_rest
      name: "a catch parameter's server default beside a rest element",
      code: `${SO}import { getServerDefault } from './db.server'
export function run() {
  try { throw { code: 1, extra: 2 } } catch ({ detail: { d } = getServerDefault() as any, ...rest }) {
    const f = createServerOnlyFn(() => d)
    return [Object.keys(rest as any), typeof f]
  }
}
`,
      expected: { value: [['code', 'extra'], 'function'] },
      gone: true,
    },
  ])('$name', check)
})

// A declaration that reads its own binding before the binding has its value
// throws: it is a statement with an effect, and stays with what it reads. A
// read is before the value in the initialiser, in the pattern up to the
// binding's own element and in the default of a pattern around it; only a
// direct read counts (no function between: KNOWN-BUGS).
describe('self-reads', () => {
  test.each<Row>([
    {
      // S2_default_of_enclosing_pattern_reads_leaf
      name: 'the default of an enclosing pattern reading a leaf throws',
      code: `${SO}export function run() {
  const { a: { x } = x } = {} as any
  const f = createServerOnlyFn(() => x)
  return 4
}
`,
      expected: { throws: 'ReferenceError' },
    },
    {
      // S2_nested_array_default_reads_leaf
      name: 'the default of an enclosing array pattern reading a leaf throws',
      code: `${SO}export function run() {
  const { a: [b] = [b] } = {} as any
  const f = createServerOnlyFn(() => b)
  return 4
}
`,
      expected: { throws: 'ReferenceError' },
    },
    {
      // S2_param_nested_default_reads_leaf
      name: "a parameter's enclosing default reading a leaf throws",
      code: `${SO}function inner({ a: { b } = { b } }: any) { return createServerOnlyFn(() => b) }
export const run = () => { inner({}); return 4 }
`,
      expected: { throws: 'ReferenceError' },
    },
    {
      // S2_first_sibling_reads_itself
      name: 'a self-reading first sibling throws',
      code: `${SO}export function run() {
  const { a = a, b = 1 } = {} as any
  const f = createServerOnlyFn(() => [a, b])
  return 4
}
`,
      expected: { throws: 'ReferenceError' },
    },
    {
      // S2_last_sibling_reads_itself
      name: 'a self-reading last sibling throws',
      code: `${SO}export function run() {
  const { b = 1, a = a } = {} as any
  const f = createServerOnlyFn(() => [a, b])
  return 4
}
`,
      expected: { throws: 'ReferenceError' },
    },
    {
      // S2_sibling_reads_later_sibling
      name: 'a sibling reading a later one throws',
      code: `${SO}export function run() {
  const { a = b, b = 1 } = {} as any
  const f = createServerOnlyFn(() => [a, b])
  return 4
}
`,
      expected: { throws: 'ReferenceError' },
    },
    {
      // M4_class_extends_itself_throws
      name: 'a class extending itself throws',
      code: `${SO}
export function run() {
  let reached = false
  try {
    class X extends (X as any) {}
    const f = createServerOnlyFn(() => X)
    reached = true
    void f
  } catch (e: any) { return [reached, e.name] }
  return [reached, 'none']
}
`,
      expected: { value: [false, 'ReferenceError'] },
    },
    {
      // S2_later_sibling_reads_earlier_is_no_self_read
      name: 'a later sibling reading an earlier one is no self-read',
      code: `${SO}import { getServerDb } from './db.server'
export function run() {
  const { a: { x = getServerDb(), y = x } = {} as any, k } = { k: 4 } as any
  const f = createServerOnlyFn(() => [x, y])
  return k
}
`,
      expected: { value: 4 },
      gone: true,
    },
    {
      // S3_async_iife_self_read_is_deferred
      name: 'an async function reading its own handle leaves',
      code: `${SO}import { getServerDb } from './db.server'
const jobs = new Set<unknown>()
const job = (async () => { await getServerDb(); jobs.delete(job) })()
export const f = createServerOnlyFn(() => job)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // M4_recursive_arrow_is_not_self_initialised
      name: 'a recursive arrow function leaves',
      code: `${SO}import { getServerDb } from './db.server'
export function run() {
  const walk = (n: number): number => (n === 0 ? getServerDb().query().length : walk(n - 1))
  const f = createServerOnlyFn(() => walk(3))
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
  ])('$name', check)
})

// A function's locals, a block's declarations and the helpers of a removed
// helper leave with the code that alone read them.
describe('definitions below the top level', () => {
  test.each<Row>([
    // router-utils orphans.test.ts (moved): a loop head whose declarators
    // only erased code reads
    {
      name: 'a loop head whose declarators only erased code reads',
      code: `${SO}import { getServerVal } from './db.server'
export function run() {
  let n = 0
  for (let i = getServerVal(), j = 0; n < 2; n++) {
    createServerOnlyFn(() => [i, j])
  }
  return n
}
`,
      expected: { value: 2 },
      gone: true,
    },
    // router-utils orphans.test.ts (moved): a parameter pattern losing every
    // property keeps its type annotation and trailing comma
    {
      name: 'a parameter pattern with an annotation and a trailing comma',
      code: `${SO}import { getServerVal } from './db.server'
interface Props { a?: unknown; b?: unknown }
export function f({ a = getServerVal(), b = 'y', }: Props) {
  return createServerOnlyFn(() => [a, b])
}
export const run = () => [f.length, typeof f({})]
`,
      expected: { value: [1, 'function'] },
      gone: true,
    },
    // router-utils orphans.test.ts (moved): a function and a class
    // declaration only erased code reads go, whatever their evaluation does
    {
      name: 'a local function and a class with a static initialiser',
      code: `${SO}import { getServerVal } from './db.server'
export function run() {
  function helper() { return 1 }
  class WithStatic { static x = getServerVal() }
  const fn = createServerOnlyFn(() => helper() + String(new WithStatic()))
  return typeof fn
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // M4_block_let_read_by_hoisted_class_method
      name: "a block's const a hoisted var's method reads",
      code: `${SF}import { getServerDb } from './db.server'
{
  const db = getServerDb()
  var get = { run() { return db.query() } }
}
export const fn = createServerFn().handler(async () => get.run())
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // G3_hoisted_var_in_catch_block
      name: 'a var hoisted out of a catch block',
      code: `${SF}import { getServerDb } from './db.server'
try { JSON.parse('{}') } catch (e) { var db = getServerDb() }
export const fn = createServerFn().handler(async () => db)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // M1_pinned_sibling_inside_dead_local_helper
      name: "a sibling's effectful default inside a removed local helper",
      code: `${SO}import { record, steps, getters } from './record'
import { getServerObj } from './db.server'
export function run() {
  function helper() {
    const { unused = record('never'), s } = getServerObj() as any
    return createServerOnlyFn(() => s)
  }
  const f = createServerOnlyFn(() => helper())
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // M1_param_pattern_inside_dead_local_helper
      name: 'a parameter pattern of a removed local helper',
      code: `${SO}import { getServerDefault } from './db.server'
export function run() {
  function helper({ a = getServerDefault(), b }: any = {}) {
    return [createServerOnlyFn(() => a), b]
  }
  const f = createServerOnlyFn(() => helper())
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
  ])('$name', check)
})

// Rows of the implementation's coverage review (2026-11-23): statement slots,
// parameters of every kind, comma lists with comments and annotations, a
// `using` (it disposes, so it stays), a namespace's exported and private members.
describe('more slots and shapes', () => {
  test.each<Row>([
    {
      // review 1 L7_using_top_level
      name: 'a using in a block stays and disposes',
      code: `${SO}import { record, calls } from './record'
const res = { [Symbol.dispose]() { record('disposed') } }
export function run() {
  { using r = res; const fn = createServerOnlyFn(() => r) }
  return calls.length
}
`,
      expected: { value: 1, calls: ['disposed'] },
    },
    {
      // review 3 Y11_using
      name: 'a using only erased code reads stays',
      code: `${SO}import { getServerDb } from './db.server'
import { record, calls } from './record'
export function g() { { using r = { [Symbol.dispose]() { record('dispose') }, db: getServerDb() }; const f = createServerOnlyFn(() => r.db) } return calls.length }
export const run = () => g()
`,
      expected: { value: 1, calls: ['dispose'] },
    },
    {
      // review 3 Y2_if_var
      name: 'the bodies of an if and its else',
      code: `${SO}import { getServerDb, getServerVal } from './db.server'
export function g(c: boolean) { if (c) var x = getServerDb(); else var y = getServerVal(); const f = createServerOnlyFn(() => [x, y]); return typeof f }
export const run = () => [g(true), g(false)]
`,
      expected: { value: ['function', 'function'] },
      gone: true,
    },
    {
      // review 3 Y3b_do_var_asi
      name: 'a do body without semicolons',
      code: `${SO}import { getServerDb } from './db.server'
export function g() { let n = 0
  do var x = getServerDb()
  while (n++ < 1)
  const f = createServerOnlyFn(() => x); return n }
export const run = () => g()
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // review 3 Y6_for_init_all_dead
      name: 'a for initialiser whose declarators all leave',
      code: `${SO}import { getServerDb } from './db.server'
import { record } from './record'
export function g() { let s = 0; for (let db = getServerDb(); s < 2; ) { s++; record('f' + typeof createServerOnlyFn(() => db)) } return s }
export const run = () => g()
`,
      expected: { value: 2, calls: ['ffunction', 'ffunction'] },
      gone: true,
    },
    {
      // review 3 Y9_switch_case
      name: 'a case body',
      code: `${SO}import { getServerDb } from './db.server'
export function g(n: number) { switch (n) { case 1: const db = getServerDb(); return typeof createServerOnlyFn(() => db); default: return 'd' } }
export const run = () => [g(1), g(2)]
`,
      expected: { value: ['function', 'd'] },
      gone: true,
    },
    {
      // review 3 Y10_static_block
      name: 'a class static block',
      code: `${SO}import { getServerDb } from './db.server'
export class K { static f: unknown; static { const db = getServerDb(); K.f = createServerOnlyFn(() => db) } }
export const run = () => typeof K.f
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 3 Y15_catch_object_default
      name: "a catch parameter's default",
      code: `${SO}import { getServerDb } from './db.server'
export function g() { try { throw { message: 'm' } } catch ({ message, extra = getServerDb() }: any) { return [message, typeof createServerOnlyFn(() => extra)] } }
export const run = () => g()
`,
      expected: { value: ['m', 'function'] },
      gone: true,
    },
    {
      // review 3 I9_catch_param_nested_default
      name: "a catch parameter's nested default",
      code: `${SO}import { getServerObj } from './db.server'
export function g() { try { throw {} } catch ({ a: { b } = getServerObj() }: any) { return typeof createServerOnlyFn(() => b) } }
export const run = () => g()
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 3 Y18_hole_after_elision
      name: 'an array hole after an elision steps the iterator as before',
      code: `${SO}import { getServerDb } from './db.server'
import { calls, steps } from './record'
export function g() { const [, b, c = getServerDb()] = steps(5) as any; return [b, typeof createServerOnlyFn(() => c)] }
export const run = () => [g(), calls]
`,
      expected: {
        value: [
          [1, 'function'],
          ['next', 'next', 'next', 'return'],
        ],
        calls: ['next', 'next', 'next', 'return'],
      },
      gone: true,
    },
    {
      // review 3 I1_decl_items_comments
      name: 'declarators separated by comments',
      code: `${SO}import { getServerDb } from './db.server'
export function g() {
  let a = 1, // first
    b = getServerDb(), /* second */
    c = 3
  return [a, c, typeof createServerOnlyFn(() => b)]
}
export const run = () => g()
`,
      expected: { value: [1, 3, 'function'] },
      gone: true,
    },
    {
      // review 3 I2_decl_items_ts
      name: 'typed and definite declarators',
      code: `${SO}import { getServerDb } from './db.server'
export function g() { let a!: number, b: ReturnType<typeof getServerDb> = getServerDb(), c: number = 2; a = 1; return [a, c, typeof createServerOnlyFn(() => b)] }
export const run = () => g()
`,
      expected: { value: [1, 2, 'function'] },
      gone: true,
    },
    {
      // review 3 X3_var_forof_and_list
      name: 'a var declared by a for-of head and a statement',
      code: `${SO}import { getServerVal } from './db.server'
export function g() { for (var x of [1]) {} var x: any = getServerVal(); return [typeof createServerOnlyFn(() => x)] }
export const run = () => g()
`,
      expected: { value: ['function'] },
      gone: true,
    },
    {
      // review 3 Y21_param_mixed_length
      name: 'required, default, optional and pattern parameters: length unchanged',
      code: `${SO}import { getServerDb } from './db.server'
export function g(a: number, b = getServerDb(), c?: number) { return typeof createServerOnlyFn(() => b) }
export const run = () => [g.length, g(1)]
`,
      expected: { value: [1, 'function'] },
      gone: true,
    },
    {
      // review 3 Y25_ctor_param_default
      name: "a constructor's parameter default",
      code: `${SO}import { getServerDb } from './db.server'
export class K { f: unknown; constructor(db = getServerDb()) { this.f = createServerOnlyFn(() => db) } }
export const run = () => [K.length, typeof new K().f]
`,
      expected: { value: [0, 'function'] },
      gone: true,
    },
    {
      // review 3 Y26_export_default_fn_param
      name: "an export default function's parameter default",
      code: `${SO}import { getServerDb } from './db.server'
export default function (db = getServerDb()) { return typeof createServerOnlyFn(() => db) }
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // review 3 P1_async_arrow_param_pattern
      name: "an async arrow's parameter pattern",
      code: `${SO}import { getServerObj } from './db.server'
export const g = async ({ secret }: any = getServerObj()) => typeof createServerOnlyFn(() => secret)
export const run = () => g.length
`,
      expected: { value: 0 },
      gone: true,
    },
    {
      // review 3 P4_param_pattern_default_after_required
      name: 'a pattern parameter default after a required one',
      code: `${SO}import { getServerObj } from './db.server'
export function g(a: number, { secret }: any = getServerObj(), c?: number) { return [a, typeof createServerOnlyFn(() => secret)] }
export const run = () => [g.length, g(1)]
`,
      expected: { value: [1, [1, 'function']] },
      gone: true,
    },
    {
      // review 3 X6_param_default_fn_dead
      name: 'a parameter default that is a function',
      code: `${SO}import { getServerDb } from './db.server'
export function g(cb = () => { const db = getServerDb(); return db }) { return typeof createServerOnlyFn(() => cb()) }
export const run = () => [g.length, g()]
`,
      expected: { value: [0, 'function'] },
      gone: true,
    },
    {
      // review 3 P6_param_rest_array_default
      name: "a rest parameter's array pattern default",
      code: `${SO}import { getServerDb } from './db.server'
export function g(...[a = getServerDb()]: any[]) { return typeof createServerOnlyFn(() => a) }
export const run = () => [g.length, g()]
`,
      expected: { value: [0, 'function'] },
      gone: true,
    },
    {
      // review 3 X7_rest_param_object_pattern
      name: "a rest parameter's object pattern default",
      code: `${SO}import { getServerDb } from './db.server'
export function g(...{ length, 0: first = getServerDb() }: any) { return [length, typeof createServerOnlyFn(() => first)] }
export const run = () => [g.length, g()]
`,
      expected: { value: [0, [0, 'function']] },
      gone: true,
    },
    {
      // review 3 N1_ns_multi_decl
      name: "a namespace's exported declarators stay",
      code: `${SO}import { getServerDb } from './db.server'
export namespace C { export const a = 1, b = getServerDb(); export const f = createServerOnlyFn(() => b.query()) }
export const run = () => [C.a, typeof C.b]
`,
      expected: { value: [1, 'object'] },
    },
    {
      // review 3 X9_ns_exported_fn_param
      name: "a namespace's exported function loses its parameter default, its exported declarators stay",
      code: `${SO}import { getServerDb } from './db.server'
export namespace C { export const a = 1, b = getServerDb(); export function h(db = b) { return typeof createServerOnlyFn(() => db) } }
export const run = () => [C.h.length, C.h(), typeof C.b]
`,
      expected: { value: [0, 'function', 'object'] },
    },
    {
      // review 3 N24_ns_nonexported_member_pattern
      name: "a namespace's private pattern member leaves",
      code: `${SO}import { getServerObj } from './db.server'
export namespace C { const { secret, unused } = getServerObj(); export const f = createServerOnlyFn(() => secret); export const k = 1 }
export const run = () => C.k
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // review 3 S9_pattern_later_sibling_default
      name: 'a default reading a later sibling throws',
      code: `${SO}import { getServerVal } from './db.server'
export function g() { const { a = b, b } = { b: getServerVal() } as any; const f = createServerOnlyFn(() => [a, b]); return 1 }
export const run = () => { try { return g() } catch (e) { return (e as Error).name } }
`,
      expected: { value: 'ReferenceError' },
    },
    {
      // review 3 S12_satisfies_self_fn
      name: 'a function behind satisfies is no self-read',
      code: `${SO}import { getServerVal } from './db.server'
export function g() { const h = ((n: number): unknown => n ? h(n - 1) : getServerVal()) satisfies Function; const f = createServerOnlyFn(() => h(1)); return 1 }
export const run = () => g()
`,
      expected: { value: 1 },
      gone: true,
    },
  ])('$name', check)
})
