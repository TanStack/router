import * as React from 'react'
// @ts-expect-error
import { useMemo } from 'tan-react'

const useUsedVar = 'i-am-unused'

const ReactUseMemoCall1 = React.useMemo(function performAction() {
  return 'true'
}, [])

console.log(ReactUseMemoCall1)

const ReactUseMemoCall2 = React.useMemo(() => {
  return 'true'
}, [])

console.log(ReactUseMemoCall2)

const UseMemoCall1 = useMemo(function performAction() {
  return 'true'
}, [])

console.log(UseMemoCall1)

const UseMemoCall2 = useMemo(() => {
  return 'true'
}, [])

console.log(UseMemoCall2)
