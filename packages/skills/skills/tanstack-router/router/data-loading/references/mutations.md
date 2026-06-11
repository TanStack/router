# Data Mutations

Handle form submissions and data updates.

## Form Actions

TanStack Start provides server functions for mutations. For Router-only:

```tsx
function CreatePost() {
  const [isPending, setIsPending] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsPending(true)

    const formData = new FormData(e.target as HTMLFormElement)
    const post = await createPost(formData)

    // Invalidate and navigate
    await router.invalidate()
    navigate({ to: '/posts/$postId', params: { postId: post.id } })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" />
      <button disabled={isPending}>Create</button>
    </form>
  )
}
```

## Router Invalidation

Refetch loader data after mutation:

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  const handleDelete = async (id: string) => {
    await deletePost(id)
    await router.invalidate() // Refetch all active loaders
  }
}
```

## Optimistic Updates

Update UI before server confirms:

```tsx
function LikeButton({ postId, initialLikes }) {
  const [likes, setLikes] = useState(initialLikes)
  const [isPending, setIsPending] = useState(false)

  const handleLike = async () => {
    setLikes((l) => l + 1) // Optimistic
    setIsPending(true)

    try {
      await likePost(postId)
    } catch {
      setLikes((l) => l - 1) // Rollback
    } finally {
      setIsPending(false)
    }
  }

  return <button onClick={handleLike}>{likes} likes</button>
}
```

## With TanStack Query

Better mutation handling with Query:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreatePost() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      router.navigate({ to: '/posts/$postId', params: { postId: post.id } })
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate(new FormData(e.target))
      }}
    >
      <button disabled={mutation.isPending}>Create</button>
    </form>
  )
}
```
