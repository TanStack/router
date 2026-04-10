import type { JSX } from 'solid-js'

export function SafeFragment(props: any): JSX.Element {
  return <>{props.children}</>
}
