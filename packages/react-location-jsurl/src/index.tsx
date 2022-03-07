import { parseSearchWith, stringifySearchWith } from '@tanstack/react-location'
import { stringify, parse } from './jsurl'

export function stringifySearch(search: Record<string, unknown>) {
  return stringifySearchWith(stringify)(search)
}

export function parseSearch(searchStr: string) {
  return parseSearchWith(parse)(searchStr)
}
