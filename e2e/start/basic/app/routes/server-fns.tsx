import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { ConsistentServerFnCalls } from './-server-fns/consistent-fn-calls'
import { MultipartServerFnCall } from './-server-fns/multipart-formdata-fn-call'
import { AllowServerFnReturnNull } from './-server-fns/allow-fn-return-null'
import { SerializeFormDataFnCall } from './-server-fns/serialize-formdata-fn-call'
import { ResponseHeaders, getTestHeaders } from './-server-fns/response-headers'
import { SubmitPostFormDataFn } from './-server-fns/submit-post-formdata-fn'
import { DeadCodeFnCall } from './-server-fns/dead-code-preserve'

export const Route = createFileRoute('/server-fns')({
  component: RouteComponent,
  loader: async () => {
    return {
      testHeaders: await getTestHeaders(),
    }
  },
})

function RouteComponent() {
  const { testHeaders } = Route.useLoaderData()
  return (
    <>
      <ConsistentServerFnCalls />
      <MultipartServerFnCall />
      <AllowServerFnReturnNull />
      <SerializeFormDataFnCall />
      <ResponseHeaders initialTestHeaders={testHeaders} />
      <SubmitPostFormDataFn />
      <DeadCodeFnCall />
    </>
  )
}
