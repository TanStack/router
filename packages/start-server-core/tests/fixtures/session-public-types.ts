import type { SessionConfig } from '@tanstack/start-server-core'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Assert<Condition extends true> = Condition
type Seal = NonNullable<SessionConfig['seal']>

export type EncryptionAlgorithms = Assert<
  Equal<
    NonNullable<Seal['encryption']>['algorithm'],
    'aes-128-ctr' | 'aes-256-cbc'
  >
>
export type IntegrityAlgorithm = Assert<
  Equal<NonNullable<Seal['integrity']>['algorithm'], 'sha256'>
>
