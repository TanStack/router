import * as React from 'react'
import { useAuth } from '../../main'
import { routeConfig } from '../../routes.generated/authenticated'

routeConfig.generate({
  component: Authenticated,
})

function Authenticated() {
  const auth = useAuth()

  return (
    <div className="p-2">
      You're authenticated! Your username is <strong>{auth.username}</strong>
      <div className="h-2" />
      <button
        onClick={() => auth.logout()}
        className="text-sm bg-blue-500 text-white border inline-block py-1 px-2 rounded"
      >
        Log out
      </button>
      <div className="h-2" />
      <div>
        This authentication example is obviously very contrived and simple. It
        doesn't cover the use case of a redirected login page, but does
        illustrate how easy it is to simply wrap routes with ternary logic to
        either show a login prompt or redirect (probably with the `Navigate`
        component).
      </div>
    </div>
  )
}
