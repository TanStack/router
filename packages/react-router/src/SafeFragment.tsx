import * as React from 'react'

export function SafeFragment(props: any): React.JSX.Element {
  return <>{props.children}</>
}
