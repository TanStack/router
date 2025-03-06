import { useState } from 'react'
import { Button, Stack } from '@mui/material'

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <Stack>
      <Button
        variant="contained"
        size="large"
        onClick={() => setCount(count + 1)}
      >
        Clicks: {count}
      </Button>
    </Stack>
  )
}
