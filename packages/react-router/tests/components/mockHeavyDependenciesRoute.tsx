// This mimicks the waiting of heavy dependencies, which need to be streamed in before the component is available.
await new Promise((resolve) => setTimeout(resolve, 5000))

export default function HeavyComponent() {
  return <h1>I am sooo heavy</h1>
}
