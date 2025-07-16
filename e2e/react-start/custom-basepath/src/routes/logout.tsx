import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const logoutFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  // do logout stuff here
  throw redirect({
    to: '/',
  })
})

export const Route = createFileRoute('/logout')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2">
      <h3>Logout Page</h3>
      <p>
        This form tests that server function URLs correctly include the app's
        basepath. The form action should be '/custom/basepath/_serverFn/...' not
        just '/_serverFn/...'
      </p>
      <form action={logoutFn.url} method="POST">
        <input type="hidden" name="csrfToken" value="123abc" />
        <button type="submit">Logout</button>
      </form>
    </div>
  )
}
