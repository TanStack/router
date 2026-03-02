# Auth Strategies

Common authentication implementation patterns.

## Credentials (Email/Password)

```tsx
import { createServerFn } from '@tanstack/start'
import { useSession } from 'vinxi/http'
import bcrypt from 'bcryptjs'

const login = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
  )
  .handler(async ({ data }) => {
    const user = await db.user.findUnique({
      where: { email: data.email },
    })

    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
      throw new Error('Invalid credentials')
    }

    const session = await useSession({ password: process.env.SESSION_SECRET! })
    await session.update({ userId: user.id })

    return { success: true }
  })

const register = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const passwordHash = await bcrypt.hash(data.password, 10)

    const user = await db.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
      },
    })

    const session = await useSession({ password: process.env.SESSION_SECRET! })
    await session.update({ userId: user.id })

    return { success: true }
  })
```

## OAuth

```tsx
// Redirect to provider
const startOAuth = createServerFn().handler(async () => {
  const state = crypto.randomUUID()
  const session = await useSession({ password: process.env.SESSION_SECRET! })
  await session.update({ oauthState: state })

  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!)
  url.searchParams.set('redirect_uri', `${process.env.APP_URL}/auth/callback`)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'read:user user:email')

  throw redirect({ to: url.toString() })
})

// Handle callback
export const Route = createFileRoute('/auth/callback')({
  loader: async ({ search }) => {
    const { code, state } = search
    // Verify state, exchange code for token, create session
  },
})
```

## Magic Links

```tsx
const sendMagicLink = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const token = crypto.randomUUID()

    await db.magicLink.create({
      data: {
        email: data.email,
        token,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
      },
    })

    await sendEmail({
      to: data.email,
      subject: 'Sign in to MyApp',
      html: `<a href="${process.env.APP_URL}/auth/magic?token=${token}">Sign in</a>`,
    })

    return { sent: true }
  })
```
