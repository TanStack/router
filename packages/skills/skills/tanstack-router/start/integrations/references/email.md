---
name: email-integration
---

# Email Integration

Sending emails from TanStack Start server functions.

## Resend (Recommended)

Modern email API for developers.

### Installation

```bash
npm install resend
```

### Configuration

```tsx
// utils/email.ts
import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY!)
```

### Basic Email

```tsx
import { createServerFn } from '@tanstack/react-start'
import { resend } from '../utils/email'

export const sendWelcomeEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string; name: string }) => data)
  .handler(async ({ data }) => {
    const { error } = await resend.emails.send({
      from: 'Your App <noreply@yourapp.com>',
      to: data.email,
      subject: 'Welcome to Your App!',
      html: `<h1>Welcome, ${data.name}!</h1><p>Thanks for signing up.</p>`,
    })

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`)
    }

    return { success: true }
  })
```

### With React Email Templates

```bash
npm install @react-email/components
```

```tsx
// emails/welcome.tsx
import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
} from '@react-email/components'

interface WelcomeEmailProps {
  name: string
  loginUrl: string
}

export function WelcomeEmail({ name, loginUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif' }}>
        <Container>
          <Text>Welcome, {name}!</Text>
          <Text>Thanks for signing up. Click below to get started:</Text>
          <Button
            href={loginUrl}
            style={{ background: '#000', color: '#fff', padding: '12px 20px' }}
          >
            Get Started
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
```

```tsx
// Server function with React Email
import { render } from '@react-email/render'
import { WelcomeEmail } from '../emails/welcome'

export const sendWelcomeEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string; name: string }) => data)
  .handler(async ({ data }) => {
    const html = await render(
      WelcomeEmail({
        name: data.name,
        loginUrl: `${process.env.APP_URL}/login`,
      }),
    )

    await resend.emails.send({
      from: 'Your App <noreply@yourapp.com>',
      to: data.email,
      subject: 'Welcome to Your App!',
      html,
    })

    return { success: true }
  })
```

## SendGrid

Enterprise email delivery.

### Installation

```bash
npm install @sendgrid/mail
```

### Configuration

```tsx
// utils/email.ts
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export { sgMail }
```

### Basic Email

```tsx
import { createServerFn } from '@tanstack/react-start'
import { sgMail } from '../utils/email'

export const sendEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { to: string; subject: string; html: string }) => data)
  .handler(async ({ data }) => {
    await sgMail.send({
      from: 'noreply@yourapp.com',
      to: data.to,
      subject: data.subject,
      html: data.html,
    })

    return { success: true }
  })
```

### With Templates

```tsx
export const sendTemplateEmail = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      to: string
      templateId: string
      dynamicData: Record<string, any>
    }) => data,
  )
  .handler(async ({ data }) => {
    await sgMail.send({
      from: 'noreply@yourapp.com',
      to: data.to,
      templateId: data.templateId,
      dynamicTemplateData: data.dynamicData,
    })

    return { success: true }
  })
```

## Nodemailer

Self-hosted or SMTP-based email.

### Installation

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

### Configuration

```tsx
// utils/email.ts
import nodemailer from 'nodemailer'

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})
```

### Basic Email

```tsx
import { createServerFn } from '@tanstack/react-start'
import { transporter } from '../utils/email'

export const sendEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { to: string; subject: string; html: string }) => data)
  .handler(async ({ data }) => {
    await transporter.sendMail({
      from: '"Your App" <noreply@yourapp.com>',
      to: data.to,
      subject: data.subject,
      html: data.html,
    })

    return { success: true }
  })
```

## Common Patterns

### Password Reset Email

```tsx
export const sendPasswordResetEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    })

    if (!user) {
      // Don't reveal if user exists
      return { success: true }
    }

    const token = crypto.randomUUID()
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt: expires,
    })

    const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`

    await resend.emails.send({
      from: 'Your App <noreply@yourapp.com>',
      to: data.email,
      subject: 'Reset your password',
      html: `
        <h1>Password Reset</h1>
        <p>Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link expires in 1 hour.</p>
      `,
    })

    return { success: true }
  })
```

### Email Verification

```tsx
export const sendVerificationEmail = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; email: string }) => data)
  .handler(async ({ data }) => {
    const token = crypto.randomUUID()

    await db.insert(emailVerificationTokens).values({
      userId: data.userId,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })

    const verifyUrl = `${process.env.APP_URL}/verify-email?token=${token}`

    await resend.emails.send({
      from: 'Your App <noreply@yourapp.com>',
      to: data.email,
      subject: 'Verify your email',
      html: `
        <h1>Verify Your Email</h1>
        <p>Click below to verify your email address:</p>
        <a href="${verifyUrl}">Verify Email</a>
      `,
    })

    return { success: true }
  })
```

### Notification Email

```tsx
export const sendNotificationEmail = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      userId: string
      type: 'comment' | 'mention' | 'follow'
      metadata: Record<string, any>
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, data.userId),
    })

    if (!user || !user.emailNotifications) {
      return { skipped: true }
    }

    const templates = {
      comment: {
        subject: 'New comment on your post',
        html: `<p>${data.metadata.commenterName} commented on your post "${data.metadata.postTitle}"</p>`,
      },
      mention: {
        subject: 'You were mentioned',
        html: `<p>${data.metadata.mentionerName} mentioned you in a comment</p>`,
      },
      follow: {
        subject: 'New follower',
        html: `<p>${data.metadata.followerName} started following you</p>`,
      },
    }

    const template = templates[data.type]

    await resend.emails.send({
      from: 'Your App <noreply@yourapp.com>',
      to: user.email,
      subject: template.subject,
      html: template.html,
    })

    return { success: true }
  })
```

## Environment Variables

```bash
# Resend
RESEND_API_KEY=re_xxx

# SendGrid
SENDGRID_API_KEY=SG.xxx

# SMTP (Nodemailer)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user
SMTP_PASS=password

# App URL for links
APP_URL=https://yourapp.com
```

## Error Handling

```tsx
export const sendEmailSafely = createServerFn({ method: 'POST' })
  .inputValidator((data: { to: string; subject: string; html: string }) => data)
  .handler(async ({ data }) => {
    try {
      await resend.emails.send({
        from: 'Your App <noreply@yourapp.com>',
        to: data.to,
        subject: data.subject,
        html: data.html,
      })
      return { success: true }
    } catch (error) {
      console.error('Email send failed:', error)
      // Log to error tracking service
      // Don't expose internal errors to client
      return { success: false, error: 'Failed to send email' }
    }
  })
```

## Rate Limiting

```tsx
const emailRateLimits = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(
  email: string,
  limit = 5,
  windowMs = 60 * 60 * 1000,
): boolean {
  const now = Date.now()
  const record = emailRateLimits.get(email)

  if (!record || now > record.resetTime) {
    emailRateLimits.set(email, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  record.count++
  return true
}

export const sendEmailWithRateLimit = createServerFn({ method: 'POST' })
  .inputValidator((data: { to: string; subject: string; html: string }) => data)
  .handler(async ({ data }) => {
    if (!checkRateLimit(data.to)) {
      return { error: 'Too many emails sent. Please try again later.' }
    }

    await resend.emails.send({
      from: 'Your App <noreply@yourapp.com>',
      to: data.to,
      subject: data.subject,
      html: data.html,
    })

    return { success: true }
  })
```
