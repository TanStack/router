/**
 * Shared internals. Not part of the documented public API and not covered by
 * semver: this entry exists so sibling packages such as `start-client-core`
 * can reuse helpers without widening the root `@tanstack/router-core` surface.
 */
export { formatStandardSchemaIssues } from './standardSchemaIssues'
