# Streaming Server Functions

Stream data from server functions.

## Basic Streaming

```tsx
import { createServerFn } from '@tanstack/start'

const streamData = createServerFn().handler(async function* () {
  yield { progress: 0 }
  await doStep1()
  yield { progress: 33 }
  await doStep2()
  yield { progress: 66 }
  await doStep3()
  yield { progress: 100, done: true }
})
```

## Consuming Streams

```tsx
function ProgressComponent() {
  const [progress, setProgress] = useState(0)

  const handleStart = async () => {
    for await (const update of streamData()) {
      setProgress(update.progress)
      if (update.done) break
    }
  }

  return (
    <div>
      <progress value={progress} max={100} />
      <button onClick={handleStart}>Start</button>
    </div>
  )
}
```

## AI/LLM Streaming

```tsx
const streamChat = createServerFn({ method: 'POST' })
  .validator(z.object({ message: z.string() }))
  .handler(async function* ({ data }) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: data.message }],
      stream: true,
    })

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        yield { text: content }
      }
    }
  })

function Chat() {
  const [response, setResponse] = useState('')

  const handleSend = async (message: string) => {
    setResponse('')
    for await (const chunk of streamChat({ data: { message } })) {
      setResponse((prev) => prev + chunk.text)
    }
  }
}
```

## Long-Running Tasks

```tsx
const processLargeFile = createServerFn({ method: 'POST' }).handler(
  async function* ({ data }) {
    const records = await parseCSV(data.file)
    const total = records.length

    for (let i = 0; i < records.length; i++) {
      await processRecord(records[i])

      if (i % 100 === 0) {
        yield { processed: i, total, percent: Math.round((i / total) * 100) }
      }
    }

    yield { processed: total, total, percent: 100, complete: true }
  },
)
```
