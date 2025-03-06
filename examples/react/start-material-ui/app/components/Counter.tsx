import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <button
      className="increment"
      onClick={() => setCount(count + 1)}
      type="button"
    >
      Clicks: {count}
    </button>
  )
}
