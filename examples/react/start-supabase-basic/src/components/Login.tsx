import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useMutation } from '@tanstack/react-query'
import { loginFn } from '../routes/_authed'
import { signupFn } from '../routes/signup'
import { Auth } from './Auth'

type AuthResponse =
  | {
      error?: boolean
      message?: string
    }
  | undefined

type AuthVariables = {
  data: {
    email: string
    password: string
  }
}

export function Login() {
  const router = useRouter()

  const loginServerFn = useServerFn(loginFn)
  const signupServerFn = useServerFn(signupFn)

  const loginMutation = useMutation<AuthResponse, Error, AuthVariables>({
    mutationFn: loginServerFn,
    onSuccess: async (data) => {
      if (!data?.error) {
        await router.invalidate()
        router.navigate({ to: '/' })
      }
    },
  })

  const signupMutation = useMutation<AuthResponse, Error, AuthVariables>({
    mutationFn: signupServerFn,
  })

  return (
    <Auth
      actionText="Login"
      status={loginMutation.status}
      onSubmit={(e) => {
        const form = e.target as HTMLFormElement
        const formData = new FormData(form)

        loginMutation.mutate({
          data: {
            email: String(formData.get('email') ?? ''),
            password: String(formData.get('password') ?? ''),
          },
        })
      }}
      afterSubmit={
        loginMutation.data ? (
          <>
            <div className="text-red-400">{loginMutation.data.message}</div>

            {loginMutation.data.error &&
              loginMutation.data.message === 'Invalid login credentials' && (
                <div>
                  <button
                    type="button"
                    className="text-blue-500 cursor-pointer"
                    onClick={(e) => {
                      const form = (e.currentTarget as HTMLButtonElement).form
                      if (!form) return

                      const formData = new FormData(form)

                      signupMutation.mutate({
                        data: {
                          email: String(formData.get('email') ?? ''),
                          password: String(formData.get('password') ?? ''),
                        },
                      })
                    }}
                  >
                    Sign up instead?
                  </button>
                </div>
              )}
          </>
        ) : null
      }
    />
  )
}
