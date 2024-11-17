import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ConsistentServerFnCalls } from './-server-fns/consistent-fn-calls'
import { MultipartServerFnCall } from './-server-fns/multipart-formdata-fn-call'
import { FunctionUrlNotHardcoded } from './-server-fns/fn-url-not-hardcoded'

export const Route = createFileRoute('/server-fns')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <ConsistentServerFnCalls />
      <MultipartServerFnCall />
      <FunctionUrlNotHardcoded />
    </>
  )
}
