// The public server entry is server-only: import protection denies it to
// the client wherever it is imported from, a package's module included
// (bundlers keep this self-reference: it is external to the package build).
import '@tanstack/solid-start/server-only'
export * from '@tanstack/solid-start-server'
