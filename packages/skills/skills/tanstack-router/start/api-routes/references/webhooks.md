# Webhooks

Handling webhook requests from external services.

## Basic Webhook Handler

```tsx
// app/routes/api/webhooks/stripe.ts
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'

export const APIRoute = createAPIFileRoute('/api/webhooks/stripe')({
  POST: async ({ request }) => {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return json({ error: 'Missing signature' }, { status: 400 })
    }

    try {
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!,
      )

      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutComplete(event.data.object)
          break
        case 'customer.subscription.deleted':
          await handleSubscriptionCanceled(event.data.object)
          break
      }

      return json({ received: true })
    } catch (err) {
      console.error('Webhook error:', err)
      return json({ error: 'Invalid signature' }, { status: 400 })
    }
  },
})
```

## GitHub Webhook

```tsx
import crypto from 'crypto'

function verifyGitHubSignature(payload: string, signature: string): boolean {
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
      .update(payload)
      .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export const APIRoute = createAPIFileRoute('/api/webhooks/github')({
  POST: async ({ request }) => {
    const body = await request.text()
    const signature = request.headers.get('x-hub-signature-256')

    if (!signature || !verifyGitHubSignature(body, signature)) {
      return json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = request.headers.get('x-github-event')
    const payload = JSON.parse(body)

    if (event === 'push') {
      await handlePush(payload)
    }

    return json({ success: true })
  },
})
```

## Idempotency

```tsx
export const APIRoute = createAPIFileRoute('/api/webhooks/payment')({
  POST: async ({ request }) => {
    const body = await request.json()
    const eventId = body.id

    // Check if already processed
    const existing = await db.webhookEvent.findUnique({
      where: { eventId },
    })

    if (existing) {
      return json({ status: 'already_processed' })
    }

    // Process and record
    await db.$transaction([
      processPayment(body),
      db.webhookEvent.create({ data: { eventId, processedAt: new Date() } }),
    ])

    return json({ status: 'processed' })
  },
})
```

## Async Processing

```tsx
POST: async ({ request }) => {
  const event = await verifyAndParse(request)

  // Queue for background processing
  await queue.add('webhook', { event })

  // Respond immediately
  return json({ queued: true })
}
```
