# Route Masking

Display a different URL than the actual route being rendered.

## Use Cases

- Show modal with clean URL (`/photos/123` shows as `/`)
- Preview routes without changing visible URL
- Deep link sharing with simplified display URL

## Basic Masking

```tsx
<Link to="/photos/$photoId" params={{ photoId: '123' }} mask={{ to: '/' }}>
  View Photo
</Link>
```

User sees `/` in URL bar but `/photos/123` route renders.

## Navigate with Mask

```tsx
const navigate = useNavigate()

navigate({
  to: '/photos/$photoId',
  params: { photoId: '123' },
  mask: { to: '/' },
})
```

## Mask with Search/Hash

```tsx
<Link
  to="/posts/$postId"
  params={{ postId: '123' }}
  mask={{
    to: '/posts',
    search: { preview: true },
  }}
>
  Preview Post
</Link>
```

## Unmasking

When users navigate directly to masked URL:

```tsx
// If user navigates to / directly, they see home
// If user clicks masked link, they see photo modal over home

export const Route = createFileRoute('/photos/$photoId')({
  component: PhotoModal,
})

function PhotoModal() {
  // Check if route is masked
  const router = useRouter()
  const isMasked = router.state.location.maskedLocation !== undefined
}
```

## Modal Pattern

Common pattern for photo galleries:

```tsx
function PhotoGrid() {
  return (
    <div className="grid">
      {photos.map((photo) => (
        <Link
          key={photo.id}
          to="/photos/$photoId"
          params={{ photoId: photo.id }}
          mask={{ to: '/gallery' }}
        >
          <img src={photo.thumbnail} />
        </Link>
      ))}
    </div>
  )
}
```
