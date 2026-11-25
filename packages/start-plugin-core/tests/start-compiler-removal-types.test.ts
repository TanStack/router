import { describe, test } from 'vitest'
import { SO, checkRow, useRemovalHost } from './removal-cases'
import type { Row } from './removal-cases'

// What a type the client erases names: along erased text a type declaration
// is a name, read by TypeScript's spaces (the value, the type, the namespace),
// and an ambient declaration is its value's own text.
// The rows and how they are checked: `./removal-cases`.

const host = useRemovalHost()
const check = async (row: Row) => checkRow(await host(), row)

// A reference names the declarations of its space (D1 A): a read or `typeof`
// names the value, a type position the type declarations, and a type the
// client erases names what its text names. A value only the type of the same
// name was used for stays where nothing else changed.
describe('a name that is a value and a type', () => {
  test.each<Row>([
    {
      // T1_type_use_follows_shared_type_to_typeof
      name: 'a type use follows the type of the name to the value its typeof names',
      code: `${SO}import { getServerDb } from './db.server'
export function run() {
  const db = getServerDb()
  type Foo = typeof db
  const Foo = 1
  const f = createServerOnlyFn(() => null as unknown as Foo)
  return 1
}
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T1_schema_and_its_inferred_type
      name: 'a schema and the type inferred from it',
      code: `${SO}import { getServerDb } from './db.server'
const User = getServerDb()
type User = typeof User
export const f = createServerOnlyFn((): User => User)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T1_interface_and_class_both_used
      name: 'an interface and a class of one name',
      code: `${SO}import { getServerDb } from './db.server'
export function run() {
  interface Foo { extra: number }
  class Foo { db = getServerDb() }
  const f = createServerOnlyFn(() => null as unknown as Foo)
  return 1
}
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T1_type_export_chain_to_shared_name_keeps_value
      name: "a type export chain to a shared name keeps the value's registration",
      code: `${SO}const registrations: Array<string> = []
const Shape = registrations.push('registered')
type Shape = { ok: boolean }
type Alias = Shape
export type Result = Alias
export const f = createServerOnlyFn(() => 1)
export const run = () => registrations.length
`,
      expected: { value: 1 },
    },
    {
      // review 5 (D1 limit, KNOWN-BUGS): erased code names `Foo` as a type;
      // `db` leaves, the unread `const Foo` stays and still registers
      name: 'a binding nothing reads stays beside a type of its name erased code names',
      code: `${SO}import { getServerDb } from './db.server'
import { record, calls } from './record'
const db = getServerDb()
type Foo = typeof db
const Foo = record('reg')
export const fn = createServerOnlyFn((x: Foo) => x)
export const run = () => calls.length
`,
      expected: { value: 1, calls: ['reg'] },
      gone: true,
    },
    {
      // T1_value_use_does_not_follow_shared_type
      name: 'a value use does not follow the type of the same name',
      code: `${SO}const log: Array<string> = []
const privateHandle = log.push('handle')
const Shape = 1
type Shape = typeof privateHandle
export const f = createServerOnlyFn(() => Shape)
export const run = () => log.length
`,
      expected: { value: 1 },
    },
    {
      // G3_local_class_named_by_alias_in_erased
      name: 'a local class named through an alias by erased code',
      code: `${SO}import { getServerDb } from './db.server'
export function run() {
  class Repo { q = getServerDb() }
  type R = InstanceType<typeof Repo>
  const f = createServerOnlyFn(() => null as unknown as R)
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // G3_top_alias_of_top_value_local_use
      name: 'a top-level alias of a top-level value, used locally',
      code: `${SO}import { createServerClient } from './db.server'
const serverClient = createServerClient()
type Client = typeof serverClient
export function run() {
  type Local = { c: Client }
  const f = createServerOnlyFn(() => null as unknown as Local)
  return typeof f
}
`,
      expected: { value: 'function' },
      gone: true,
    },
  ])('$name', check)
})

// A type export (`export type X = …`, `export interface`, `export type { X }`,
// `export { type X }`) is no JavaScript: what only it names was used by the
// source and leaves.
describe('type exports', () => {
  test.each<Row>([
    {
      // X_V7A_export_type_alias_chain
      name: 'an exported alias chain',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export type Exported = LocalAlias
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // X_V7A_export_type_specifier
      name: 'an export type specifier',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export type { LocalAlias }
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // X_V7A_export_interface_chain
      name: 'an exported interface chain',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
interface Shape { v: typeof sv }
export type Exported = Shape
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // C4-01 (whole-PR review): a default-exported interface
      name: 'an export default interface',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
export default interface Shape { v: typeof sv }
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // C4-01 (whole-PR review): `export { X }` of a local type, no `type`
      name: 'an export specifier of a local type',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export { LocalAlias }
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // whole-PR review of the declarations lane: `export default` of a
      // type alias
      name: 'an export default of a type alias',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export default LocalAlias
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      name: 'an export default of an interface',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
interface Shape { v: typeof sv }
export default Shape
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // the import leaves with the server-only body that read its value
      name: 'an export default of an inline type import',
      code: `${SO}import { getServerVal, type Secret } from './db.server'
export const f = createServerOnlyFn(() => getServerVal())
export default Secret
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      name: 'an export default of a type-only import',
      code: `${SO}import type { Secret } from './db.server'
export default Secret
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // the control: an export default of the value itself
      name: 'an export default of the value stays',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export default sv
export const f = createServerOnlyFn((): LocalAlias => sv)
export const run = () => 1
`,
      expected: { value: 1 },
    },
    {
      // an overload signature is TypeScript's text: what only it names was
      // used by the source
      name: 'an exported overload signature',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
export function pick(x: typeof sv): number
export function pick(x: unknown) { return 1 }
export const f = createServerOnlyFn(() => 1)
export const run = () => pick(null)
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      name: 'a default-exported overload signature',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
export default function pick(x: typeof sv): number
export default function pick(x: unknown) { return 1 }
export const f = createServerOnlyFn(() => 1)
export const run = () => pick(null)
`,
      expected: { value: 1 },
      gone: true,
    },
    // however the implementation is exported, or not at all (Astra's
    // re-check of the declarations lane)
    ...[
      {
        how: 'an export specifier',
        decl: 'function pick(x: typeof sv): number\nfunction pick(x: unknown) { return 1 }\nexport { pick }',
      },
      {
        how: 'export default of its name',
        decl: 'function pick(x: typeof sv): number\nfunction pick(x: unknown) { return 1 }\nexport default pick',
      },
      {
        how: 'no export',
        decl: 'function pick(x: typeof sv): number\nfunction pick(x: unknown) { return 1 }',
      },
    ].map(
      ({ how, decl }): Row => ({
        name: `an overload signature of a function exported by ${how}`,
        code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
${decl}
export const f = createServerOnlyFn(() => 1)
export const run = () => pick(null)
`,
        expected: { value: 1 },
        gone: true,
      }),
    ),
    {
      name: 'an overload signature of an anonymous default-exported function',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
export default function (x: typeof sv): number
export default function (x: unknown) { return 1 }
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // C4-01's control: both spellings beside a read of the value
      name: 'a value kept code reads stays beside both spellings',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export { LocalAlias }
export default interface Shape { v: typeof sv }
export const f = createServerOnlyFn(() => 1)
export const run = () => typeof sv
`,
      expected: { value: 'object' },
    },
    {
      // X_V7A_value_also_read_by_kept_code
      name: 'a value kept code reads too stays',
      code: `${SO}import { getServerVal } from './db.server'
const sv = getServerVal()
type LocalAlias = typeof sv
export type Exported = LocalAlias
export const f = createServerOnlyFn(() => 1)
export const run = () => typeof sv
`,
      expected: { value: 'object' },
    },
    {
      // T2_export_type_specifier_of_shared_name
      name: 'export type { X } of a name that is a value and a type',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const Shape = seen.push('registered')
type Shape = typeof db
export type { Shape }
export const fn = createServerOnlyFn(() => 1)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T2_inline_type_specifier_of_shared_name
      name: 'export { type X } of a name that is a value and a type',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const Shape = seen.push('registered')
type Shape = typeof db
const keep = 1
export { keep, type Shape }
export const fn = createServerOnlyFn(() => 1)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T2_export_type_specifier_of_a_value
      name: 'export type { x } of a value',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
export type { db }
export const fn = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // X_V9C_export_type_destructured_leaf
      name: 'an exported type naming a destructured leaf',
      code: `${SO}import { getServerDefault } from './db.server'
const { kept, srv = getServerDefault() } = (globalThis as any).cfg ?? {}
export const ok = kept
export type SrvT = typeof srv
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // X_V9D_export_type_hoisted_var
      name: 'an exported type naming a hoisted var',
      code: `${SO}import { getServerDb } from './db.server'
if (typeof globalThis !== 'undefined') {
  var db = getServerDb()
}
export type DbT = typeof db
export const f = createServerOnlyFn(() => 1)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
  ])('$name', check)
})

// A namespace with runtime content is a value, read whole. A namespace that
// holds only types is a type declaration: a qualified name follows the member
// it names, and never a value declared beside the namespace; an enum's member
// names the enum.
describe('namespaces', () => {
  test.each<Row>([
    {
      // T3_type_namespace_alone
      name: 'a type-only namespace alone',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
namespace N { export type T = typeof db }
export const fn = createServerOnlyFn((): N.T => null as any)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T3_type_namespace_merged_with_registration_direct
      name: 'a type-only namespace beside a registration',
      code: `${SO}const seen: Array<string> = []
const Bar = seen.push('registered')
namespace Bar { export type T = string }
export const fn = createServerOnlyFn((): Bar.T => 'x')
export const run = () => seen.length
`,
      expected: { value: 1 },
    },
    {
      // T3_type_namespace_merged_names_server_value
      name: 'a type-only namespace beside a value names server code',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const API = seen.push('registered')
namespace API { export type Options = typeof db }
export const fn = createServerOnlyFn((x: API.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T3_type_namespace_only_the_named_member
      name: 'only the member named',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const API = seen.push('registered')
const db = getServerDb()
const independent = seen.push('second')
namespace API { export type Options = typeof db; export type Other = typeof independent }
export const fn = createServerOnlyFn((x: API.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T3_nested_type_namespace
      name: 'a nested type-only namespace',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
namespace App { export namespace API { export type Options = typeof db } }
export const fn = createServerOnlyFn(() => ({}) as App.API.Options)
export const run = () => 42
`,
      expected: { value: 42 },
      gone: true,
    },
    {
      // T3_namespace_with_a_value_member_stays_a_value
      name: 'a namespace with a value member is a value',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
namespace API { export type Options = typeof db; export const active = 42 }
export const fn = createServerOnlyFn((x: API.Options) => x)
export const run = () => API.active
`,
      expected: { value: 42 },
      gone: true,
    },
    {
      // T4_class_merged_with_type_namespace
      name: 'a class beside a type-only namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
class Billing { static { seen.push('registered') } }
namespace Billing { export type Request = typeof db }
export const fn = createServerOnlyFn((x: Billing.Request) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T4_live_class_merged_with_type_namespace_two_members
      name: 'a live class beside a type-only namespace of two members',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const other = seen.push('other')
class Foo { static reg = seen.push('class') }
namespace Foo { export type Options = typeof db; export type Other = typeof other }
export const fn = createServerOnlyFn((x: Foo.Options) => x)
export const run = () => [seen.length, typeof Foo]
`,
      expected: { value: [2, 'function'] },
      gone: true,
    },
    {
      // T4_dotted_type_namespace_two_members
      name: 'a dotted type-only namespace of two members',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const other = seen.push('other')
namespace App.API { export type Options = typeof db; export type Other = typeof other }
export const fn = createServerOnlyFn((x: App.API.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T4_value_read_does_not_follow_merged_type_namespace
      name: 'a value read does not follow the namespace beside it',
      code: `${SO}const seen: Array<string> = []
const other = seen.push('other')
const API = 1
namespace API { export type Other = typeof other }
export const fn = createServerOnlyFn(() => API)
export const run = () => seen.length
`,
      expected: { value: 1 },
    },
    {
      // T4_typeof_does_not_follow_merged_type_namespace
      name: 'typeof does not follow the namespace beside it',
      code: `${SO}const seen: Array<string> = []
const other = seen.push('other')
const API = 1
namespace API { export type Other = typeof other }
export const fn = createServerOnlyFn(() => null as unknown as typeof API)
export const run = () => seen.length
`,
      expected: { value: 1 },
    },
    {
      // T4_interface_extends_namespace_member
      name: 'an interface extending a namespace member',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const other = seen.push('other')
namespace API { export interface Options { d: typeof db } export type Other = typeof other }
interface Extended extends API.Options {}
export const fn = createServerOnlyFn((x: Extended) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T4_type_export_of_value_and_type_namespace
      name: 'a type export of a value and a type-only namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const API = seen.push('registered')
namespace API { export type Options = typeof db }
export type { API }
export const fn = createServerOnlyFn(() => 1)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T4_reopened_type_namespace
      name: 'a reopened type-only namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const other = seen.push('other')
namespace API { export type Other = typeof other }
namespace API { export type Options = typeof db }
export const fn = createServerOnlyFn((x: API.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T4_enum_member_type_still_names_the_enum
      name: 'an enum member type names the enum',
      code: `${SO}import { getServerVal } from './db.server'
enum E { A = getServerVal() as number }
export const fn = createServerOnlyFn((x: E.A) => x)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_enum_member_beside_type_namespace
      name: 'an enum member beside a type-only namespace names the enum',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
enum Mode { Read = db.query().length }
namespace Mode { export type Registration = typeof registered }
export const fn = createServerOnlyFn((input: Mode.Read) => input)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_enum_namespace_member_names_the_namespace
      name: 'a namespace member beside an enum names the namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
enum Mode { Read = seen.push('enum') }
namespace Mode { export type Request = typeof db }
export const fn = createServerOnlyFn((input: Mode.Request) => input)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T5_plain_interface_beside_type_namespace
      name: 'a plain reference to an interface beside a type-only namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
interface Model { db: typeof db }
namespace Model { export type Registration = typeof registered }
export const fn = createServerOnlyFn((input: Model) => input)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_value_interface_type_namespace_plain_reference
      name: 'a value, an interface and a type-only namespace of one name',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const Foo = seen.push('val')
const other = seen.push('other')
interface Foo { db: typeof db }
namespace Foo { export type Bar = typeof other }
export const fn = createServerOnlyFn((x: Foo) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T8_member_interface_beside_namespace
      name: 'a member that is an interface and a namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
namespace App { export interface Model { db: typeof db }
 export namespace Model { export type Reg = typeof registered } }
export const fn = createServerOnlyFn((x: App.Model) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T8_member_namespace_as_prefix
      name: 'a member namespace as a prefix',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = (seen.push('db'), getServerDb())
const registered = seen.push('ready')
namespace App { export interface Model { db: typeof db }
 export namespace Model { export type Reg = number } }
export const fn = createServerOnlyFn((x: App.Model.Reg) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
    },
  ])('$name', check)
})

// A `declare` of a value is the value's own text, erased with the types: what
// its type names leaves with the code that named it. A definition beside a
// `declare` of its name runs, and code that reads it keeps it.
describe('ambient declarations', () => {
  test.each<Row>([
    {
      // T5_declare_type
      name: 'declare type',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
declare type Opts = typeof db
export const fn = createServerOnlyFn((x: Opts) => x)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_declare_interface
      name: 'declare interface',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
declare interface Opts { d: typeof db }
export const fn = createServerOnlyFn((x: Opts) => x)
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_declare_namespace_member
      name: 'a member of a declare namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const other = seen.push('other')
declare namespace Amb { export type Opts = typeof db; export type Other = typeof other }
export const fn = createServerOnlyFn((x: Amb.Opts) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T6_ambient_namespace_reopened_implicit_member
      name: "a reopened ambient namespace's implicit member",
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare namespace App { export interface Locals { requestId: string } }
declare namespace App { interface Locals { db: typeof db } }
export const fn = createServerOnlyFn((x: App.Locals) => x.db)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T6_ambient_namespace_implicit_members
      name: "an ambient namespace's implicit members",
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare namespace App { interface Locals { db: typeof db }
 interface Registration { value: typeof registered } }
export const fn = createServerOnlyFn((x: App.Locals) => x.db)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T6_global_namespace_implicit_members
      name: "a namespace's implicit members in declare global",
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare global { namespace TenantContext { interface Locals { db: typeof db }
 interface Registration { value: typeof registered } } }
export const fn = createServerOnlyFn((x: TenantContext.Locals) => x.db)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T7_declare_function_named_in_type
      name: 'a declare function named in a type',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare function lookup(): typeof db
export const fn = createServerOnlyFn((x: ReturnType<typeof lookup>) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T7_declare_class_named_in_type
      name: 'a declare class named in a type',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare class Svc { db: typeof db }
export const fn = createServerOnlyFn((x: Svc) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T7_declare_function_beside_type_namespace
      name: 'a declare function beside a type-only namespace',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare function make(): typeof db
namespace make { export type Reg = typeof registered }
export const fn = createServerOnlyFn((x: ReturnType<typeof make>) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_declare_const_typeof_limit
      name: 'a declare const named by typeof',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
declare const env: { db: typeof db }
export const fn = createServerOnlyFn((x: typeof env) => [x, env.db])
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T5_declare_function_limit
      name: 'a declare function only called',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
declare function lookup(): typeof db
export const fn = createServerOnlyFn(() => lookup())
export const run = () => 1
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T8_declare_const_pattern_two_declarators
      name: 'declare const with two declarators',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare const { env }: { env: typeof db }, other: typeof registered
export const fn = createServerOnlyFn(() => env)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T8_declare_global_const
      name: 'a const of declare global',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare global { const __serverCtx: { db: typeof db } }
export const fn = createServerOnlyFn(() => __serverCtx.db)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T8_declare_var_beside_var
      name: 'declare var beside var',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare var x: typeof db
var x = { query: () => 'client' }
export const fn = createServerOnlyFn(() => x.query())
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T7_declare_const_nobody_names
      name: 'a declare const nobody names',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = (seen.push('db'), getServerDb())
const registered = seen.push('ready')
declare const env: { db: typeof db }
export const fn = createServerOnlyFn(() => 1)
export const run = () => seen.length
`,
      expected: { value: 2 },
    },
    {
      // T5_declare_const_live
      name: 'a declare const live code reads',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
declare const env: { db: typeof db }
export const fn = createServerOnlyFn((x: typeof env) => x)
export const run = () => typeof db
`,
      expected: { value: 'object' },
    },
    {
      // T8_declare_global_const_live
      name: 'a const of declare global live code reads',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
declare global { const __serverCtx: { db: typeof db } }
export const fn = createServerOnlyFn(() => __serverCtx.db)
export const run = () => [seen.length, typeof db]
`,
      expected: { value: [1, 'object'] },
    },
  ])('$name', check)
})

// A type-only import names nothing of the module. `import A = N.M` is a name
// for what `N.M` names: a reference to it for a type names what the whole
// path selects there, and every alias of a chain it goes through leaves
// unread.
describe('imports and aliases of types', () => {
  test.each<Row>([
    {
      // T8_type_import_const_namespace_qualifier
      name: 'a type-only import beside a const and a namespace, qualified',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
import type { ApiResponse as X } from './client-dep'
const X = seen.push('value')
namespace X { export type T = typeof db }
export const fn = createServerOnlyFn((x: X.T) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T8_type_import_beside_const_plain
      name: 'a type-only import beside a const',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
import type { ApiResponse as X } from './client-dep'
const X = seen.push('value')
export const fn = createServerOnlyFn((x: X<1>) => [x, db])
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T9_alias_of_member_beside_const
      name: 'an alias of a member beside a const',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = seen.push('client')
namespace Kit { export type Options = typeof db }
import A = Kit.Options
export const fn = createServerOnlyFn((x: A) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T9_alias_of_namespace_beside_class
      name: 'an alias of a namespace beside a class',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
class Kit { static s = seen.push('class') }
namespace Kit { export type Options = typeof db }
import A = Kit
export const fn = createServerOnlyFn((x: A.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T9_alias_read_by_value
      name: 'an alias read by value',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = db
namespace Kit { export type Options = number }
import A = Kit
export const fn = createServerOnlyFn(() => A)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T9_alias_type_and_its_value_read
      name: 'an alias named as a type and its value read',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = db
namespace Kit { export type Options = number }
import A = Kit
export const fn = createServerOnlyFn((x: A.Options) => [x, Kit])
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T9_alias_type_and_live_value
      name: 'an alias named as a type beside a live value',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = (seen.push('kit'), db)
namespace Kit { export type Options = number }
import A = Kit
export const fn = createServerOnlyFn((x: A.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
    },
    {
      // T9_alias_inside_namespace
      name: 'an alias inside a namespace body',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = seen.push('client')
namespace Kit { export type Options = typeof db }
export namespace Outer {
  import A = Kit
  export const fn = createServerOnlyFn((x: A.Options) => x)
}
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T10_chain_in_namespace_body
      name: 'a chain in a namespace body',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = db
namespace Kit { export type Options = number }
export namespace Outer {
  import Local = Kit
  import Options = Local.Options
  export const fn = createServerOnlyFn((x: Options) => [x, Kit])
}
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T10_chain_across_scopes
      name: 'a chain across scopes',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = db
namespace Kit { export type Options = number }
import Local = Kit
export namespace Outer {
  import Options = Local.Options
  export const fn = createServerOnlyFn((x: Options) => [x, Kit])
}
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T10_CH04_three_hops
      name: 'a chain of three hops',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const registered = seen.push('ready')
const Kit = getServerDb()
namespace Kit {
  export type Options = typeof Kit
  export type Sib = typeof registered
}
import A = Kit
import B = A
import C = B
export const fn = createServerOnlyFn((x: C.Options) => [x, Kit])
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // T10_chain_registration_kept
      name: 'a chain beside a registration',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = seen.push('client')
namespace Kit { export type Options = typeof db }
import Local = Kit
import Options = Local.Options
export const fn = createServerOnlyFn((x: Options) => x)
export const run = () => seen.length
`,
      expected: { value: 2 },
      gone: true,
    },
    {
      // T10_chain_live_intermediate_alias
      name: 'a chain whose intermediate alias live code reads',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const registered = seen.push('ready')
const Kit = db
namespace Kit { export type Options = number }
import Local = Kit
import Options = Local.Options
export const fn = createServerOnlyFn((x: Options) => [x, Kit])
export const run = () => [Local === db, seen.length]
`,
      expected: { value: [true, 1] },
    },
    {
      // T10_CH06_live_intermediate_control
      name: 'a chain whose intermediate alias live code reads, two registrations',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const registered = seen.push('ready')
const db = getServerDb()
const Kit = seen.push('client')
namespace Kit {
  export type Options = typeof db
  export type Sib = typeof registered
}
import A = Kit
import B = A
export const fn = createServerOnlyFn((x: B.Options) => x)
export const live = () => A
export const run = () => [seen.length, live()]
`,
      expected: { value: [2, 2] },
      gone: true,
    },
  ])('$name', check)
})

// Rows of the implementation's coverage review (2026-11-23): type declarations
// in functions, blocks and namespace bodies, names a local shadows, overloads,
// and `declare` shapes, each named only by erased code.
describe('local and nested type declarations', () => {
  test.each<Row>([
    {
      // review 1 R2_inner_const_shadows_outer_type
      name: 'an inner const does not capture a type reference to an outer alias',
      code: `${SO}import { record, calls } from './record'
import { getServerDb } from './db.server'
type Db = ReturnType<typeof getServerDb>
export function run() {
  const Db = record('registered')
  const fn = createServerOnlyFn((x: Db) => x)
  return calls.length
}
`,
      expected: { value: 1, calls: ['registered'] },
      gone: true,
    },
    {
      // review 1 O3_overloads_local_erased_only
      name: 'local overloads only erased code calls',
      code: `${SO}import { getServerVal } from './db.server'
export function run() {
  function load(a: string): number
  function load(a: any) { return getServerVal() }
  const fn = createServerOnlyFn(() => load('x'))
  return typeof fn
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 L1_local_const_and_type_same_name_erased_value
      name: 'a local const and type of one name',
      code: `${SO}import { record, calls } from './record'
import { getServerDb } from './db.server'
export function run() {
  const Kit = getServerDb()
  type Kit = { a: 1 }
  const fn = createServerOnlyFn(() => Kit)
  return typeof fn
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 L2_local_class_interface_merge_erased
      name: 'a local class and interface of one name',
      code: `${SO}import { record, calls } from './record'
import { getServerDb } from './db.server'
export function run() {
  class Kit { static db = getServerDb() }
  interface Kit { a: 1 }
  const fn = createServerOnlyFn((x: Kit) => x)
  return typeof fn
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 L3_local_enum_erased
      name: 'a local enum',
      code: `${SO}import { record, calls } from './record'
import { getServerVal } from './db.server'
export function run() {
  enum Kit { A = getServerVal() as any }
  const fn = createServerOnlyFn(() => Kit.A)
  return typeof fn
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 L4_local_namespace_erased
      name: 'a local namespace',
      code: `${SO}import { record, calls } from './record'
import { getServerVal } from './db.server'
export namespace Out {
  namespace Kit { export const v = getServerVal() }
  export const fn = createServerOnlyFn(() => Kit.v)
}
export const run = () => typeof Out.fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 L6_local_import_alias_value_erased
      name: 'a local import alias of a value',
      code: `${SO}import { record, calls } from './record'
import { getServerVal } from './db.server'
namespace Kit { export const v = getServerVal }
export namespace Out {
  import V = Kit.v
  export const fn = createServerOnlyFn(() => V())
}
export const run = () => typeof Out.fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 A1_declare_namespace_nested_const_typeof
      name: 'a const of a namespace nested in a declare namespace',
      code: `${SO}import { record, calls } from './record'
import { getServerDb } from './db.server'
declare namespace Env { namespace Inner { const db: ReturnType<typeof getServerDb> } }
export const fn = createServerOnlyFn(() => Env.Inner.db)
export const run = () => typeof fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 A2_declare_class_member_typeof
      name: "a declare class's static member",
      code: `${SO}import { record, calls } from './record'
import { getServerDb } from './db.server'
declare class Repo { static db: ReturnType<typeof getServerDb> }
export const fn = createServerOnlyFn(() => Repo.db)
export const run = () => typeof fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 1 A5_declare_enum_named
      name: 'a declare enum',
      code: `${SO}import { getServerDb } from './db.server'
declare enum Mode { A = 1 }
type T = ReturnType<typeof getServerDb>
declare const val: T
export const fn = createServerOnlyFn(() => [Mode.A, val])
export const run = () => typeof fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 2 N5_type_alias_in_outer_fn_erased_in_inner
      name: 'an alias of an outer function named by erased code in an inner one',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
export function run() {
  type T = typeof db
  function inner() { return createServerOnlyFn((x: T) => x) }
  return typeof inner()
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 2 N6_interface_in_block
      name: 'an interface in a block',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
export function run() {
  if (true) {
    interface I { a: typeof db }
    const f = createServerOnlyFn((x: I) => x)
    return typeof f
  }
}
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 2 S1_toplevel_helper_signature_type
      name: "a helper's signature type",
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
type T = typeof db
function helper(x: T) { return x }
export const f = createServerOnlyFn(() => helper)
export const run = () => typeof f
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 2 S2_namespace_local_type
      name: "a namespace body's local type",
      code: `${SO}import { getServerDb } from './db.server'
export namespace NS {
  const db = getServerDb()
  type T = typeof db
  export const f = createServerOnlyFn((x: T) => x)
}
export const run = () => typeof NS.f
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 2 S7_local_type_used_by_erased_and_live_param_type
      name: 'an alias erased code and a live signature both name',
      code: `${SO}import { getServerDb } from './db.server'
export function run() {
  const db = getServerDb()
  type T = typeof db
  const live = (x?: T) => 'live'
  const f = createServerOnlyFn((x: T) => x)
  return [live(), typeof f]
}
`,
      expected: { value: ['live', 'function'] },
      gone: true,
    },
    {
      // review 2 G1_toplevel_helper_type_inside_isomorphic_region
      name: 'a type inside a kept isomorphic region of a reached helper',
      code: `import { createServerOnlyFn, createIsomorphicFn, createClientOnlyFn, createServerFn, Hydrate } from '@tanstack/react-start'
import { getServerDb } from './db.server'
const db = getServerDb()
type T = typeof db
function helper() { return createIsomorphicFn().client((x?: T) => x).server(() => 1) }
export const f = createServerOnlyFn(() => helper)
export const run = () => typeof f
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // review 2 N7_local_type_typeof_local_value_beside_module_same_name
      name: 'a local alias of a local value beside a module value of its name',
      code: `${SO}import { record } from './record'
import { getServerDb } from './db.server'
const db = record('top')
export function run() {
  const db = getServerDb()
  type T = typeof db
  const f = createServerOnlyFn((x: T) => x)
  return typeof f
}
`,
      expected: { value: 'function', calls: ['top'] },
      gone: true,
    },
  ])('$name', check)
})

// Review round 1 (2026-11-23): an alias chain of any length (Astra: nine hops
// fell back to the value), and a type a reopened namespace's other block
// declares (Astra, Gemini).
describe('review round 1', () => {
  test.each<Row>([
    {
      // Astra, qualified_depth_reg_9 (twelve hops here)
      name: 'a chain of twelve import aliases named for a type',
      code: `${SO}import { getServerDb } from './db.server'
const seen: Array<string> = []
const db = getServerDb()
const Kit = seen.push('ready')
namespace Kit { export type Options = typeof db }
import A0 = Kit
import A1 = A0
import A2 = A1
import A3 = A2
import A4 = A3
import A5 = A4
import A6 = A5
import A7 = A6
import A8 = A7
import A9 = A8
import A10 = A9
import A11 = A10
export const fn = createServerOnlyFn((x: A11.Options) => x)
export const run = () => seen.length
`,
      expected: { value: 1 },
      gone: true,
    },
    {
      // Astra, qualified_depth_live_alias_9 (control: live code reads an
      // intermediate alias by value, so the value it names stays)
      name: 'a chain of twelve import aliases, one read by value',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
const Kit = db
namespace Kit { export type Options = number }
import A0 = Kit
import A1 = A0
import A2 = A1
import A3 = A2
import A4 = A3
import A5 = A4
import A6 = A5
import A7 = A6
import A8 = A7
import A9 = A8
import A10 = A9
import A11 = A10
export const fn = createServerOnlyFn((x: A11.Options) => x)
export const run = () => A0 === db
`,
      expected: { value: true },
    },
    {
      // Astra ns_original, Gemini leak 1
      name: 'a type the first block of a reopened namespace declares, named in the second',
      code: `${SO}import { getServerDb } from './db.server'
namespace NS {
  const db = getServerDb()
  export type T = typeof db
}
namespace NS {
  export const fn = createServerOnlyFn((x: T) => x)
}
export const run = () => typeof NS.fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // Gemini leak 1, the type-only variant
      name: 'a type alias of a reopened namespace naming the other block’s type',
      code: `${SO}import { getServerDb } from './db.server'
const db = getServerDb()
namespace NS {
  export type T = typeof db
}
namespace NS {
  export type U = T
}
export const fn = createServerOnlyFn((x: NS.U) => x)
export const run = () => typeof fn
`,
      expected: { value: 'function' },
      gone: true,
    },
    {
      // Astra ns_live (control: live code reads the value)
      name: 'a reopened namespace whose live member reads the value',
      code: `${SO}import { getServerDb } from './db.server'
namespace NS {
  const db = getServerDb()
  export type T = typeof db
  export const kept = () => db
}
namespace NS {
  export const fn = createServerOnlyFn((x: T) => x)
}
export const run = () => typeof NS.kept()
`,
      expected: { value: 'object' },
    },
    {
      // control: a local type of the second block shadows the first block's
      name: 'a reopened namespace whose second block shadows the type',
      code: `${SO}const seen: Array<string> = []
namespace NS {
  const reg = seen.push('reg')
  export type T = typeof reg
}
namespace NS {
  export function make() {
    type T = number
    return createServerOnlyFn((x: T) => x)
  }
}
export const run = () => [seen.length, typeof NS.make()]
`,
      expected: { value: [1, 'function'] },
    },
  ])('$name', check)
})
