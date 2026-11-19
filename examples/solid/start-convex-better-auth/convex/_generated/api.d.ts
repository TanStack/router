/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from '../auth.js'
import type * as http from '../http.js'
import type * as myFunctions from '../myFunctions.js'

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from 'convex/server'

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth
  http: typeof http
  myFunctions: typeof myFunctions
}>
declare const fullApiWithMounts: typeof fullApi

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, 'public'>
>
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, 'internal'>
>

export declare const components: {
  betterAuth: import('@convex-dev/better-auth/_generated/component.js').ComponentApi<'betterAuth'>
}
