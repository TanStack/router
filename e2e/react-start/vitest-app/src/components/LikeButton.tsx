import { useState } from 'react'
import { likePost } from '../posts'

export function LikeButton({ postId }: { postId: string }) {
  const [likes, setLikes] = useState<number>()

  return (
    <button onClick={async () => setLikes(await likePost({ data: postId }))}>
      {likes === undefined ? 'Like' : `${likes} likes`}
    </button>
  )
}
