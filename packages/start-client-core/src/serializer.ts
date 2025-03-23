import { deserialize, serialize } from 'seroval'
import type { StartSerializer } from '@tanstack/router-core'

export const startSerializer: StartSerializer = {
  stringify: (value: any) => {
    return serialize(value)
  },
  parse: (value: string) => {
    return deserialize(value)
  },
  // @ts-expect-error
  encode: (value: any) => {
    return serialize(value)
  },
  decode: (value: any) => {
    return deserialize(value)
  },
}
