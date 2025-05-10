import { Login } from '~/components/Login'

export const Route = createFileRoute({
  component: LoginComp,
})

function LoginComp() {
  return <Login />
}
