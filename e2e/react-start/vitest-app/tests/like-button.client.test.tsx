import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { mockServerFn } from '@tanstack/react-start/testing'
import { afterEach, expect, test, vi } from 'vitest'
import { LikeButton } from '../src/components/LikeButton'
import { likePost } from '../src/posts'

afterEach(() => {
  cleanup()
})

test('a component sends its data to a server function and shows the answer', async () => {
  const like = vi.fn(() => 5)
  mockServerFn(likePost, like)
  render(<LikeButton postId="42" />)

  fireEvent.click(screen.getByRole('button', { name: 'Like' }))

  expect(await screen.findByRole('button', { name: '5 likes' })).toBeDefined()
  expect(like).toHaveBeenCalledOnce()
  expect(like).toHaveBeenCalledWith(expect.objectContaining({ data: '42' }))
})
