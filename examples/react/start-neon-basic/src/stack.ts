import { StackClientApp } from '@stackframe/react'
import { useNavigate as useTanstackNavigate } from '@tanstack/react-router'

const useAdaptedNavigate = () => {
  const navigate = useTanstackNavigate()
  return (to: string) => navigate({ to })
}

// Check if environment variables are available
// Stack Auth's error message references NEXT_PUBLIC_* variables but we use VITE_*,
// so we provide a clearer error message that directs users to the correct setup.
const projectId = import.meta.env.VITE_STACK_PROJECT_ID
const publishableClientKey = import.meta.env.VITE_STACK_PUBLISHABLE_CLIENT_KEY

if (!projectId || !publishableClientKey) {
  throw new Error(`
🚨 Stack Auth Configuration Error

Missing required environment variables:
- VITE_STACK_PROJECT_ID
- VITE_STACK_PUBLISHABLE_CLIENT_KEY
- STACK_SECRET_SERVER_KEY

To fix this:
1. Run 'pnpm dev' to trigger Neon Launchpad (browser tab will open)
2. Claim your project in the browser tab, or use the claim URL saved in .env
3. Navigate to "Auth" section -> "Enable Neon Auth" -> "Configuration" -> "React"
4. Copy your credentials to your .env file

Note: This example uses Neon Auth (which is built on Stack Auth).
Do not go to https://app.stack-auth.com - use https://neon.com instead.
  `)
}

export const stackClientApp = new StackClientApp({
  projectId,
  publishableClientKey,
  tokenStore: typeof window === 'undefined' ? 'memory' : 'cookie',
  redirectMethod: { useNavigate: useAdaptedNavigate },
})