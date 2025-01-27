import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ConsistentServerFnCalls } from './-server-fns/consistent-fn-calls'
import { MultipartServerFnCall } from './-server-fns/multipart-formdata-fn-call'
import { AllowServerFnReturnNull } from './-server-fns/allow-fn-return-null'
import { SerializeFormDataFnCall } from './-server-fns/serialize-formdata-fn-call'
import { SubmitPostFormDataFn } from './-server-fns/submit-post-formdata-fn'

export const Route = createFileRoute('/server-fns')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <ConsistentServerFnCalls />
      <MultipartServerFnCall />
      <AllowServerFnReturnNull />
      <SerializeFormDataFnCall />
      <SubmitPostFormDataFn />
    </>
  )
}
