import type { ComponentChildren } from 'preact'

export function SafeFragment(props: any) {
  return <>{props.children}</>
}
