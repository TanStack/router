import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'
import { Login } from '../components/Login'
import { useSupabase } from '../utils/supabase'

export const loginFn = createServerFn(
  'POST',
  async (
    payload: {
      email: string
      password: string
    },
    { request },
  ) => {
    const supabase = await useSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    })
    if (error) {
      return {
        error: true,
        message: error.message,
      }
    }
  },
)

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.user) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    if (error.message === 'Not authenticated') {
      return <Login />
    }

    throw error
  },
})
