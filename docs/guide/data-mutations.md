---
title: Data Mutations
---

First off, let's remember that [TanStack Router](../data-loading) **does not store your data for you**. Because of this...

## Data mutations are not a direct responsibility of TanStack Router

Since TanStack Router does not store your data for you, there is literally no data there for you to invalidate or mutate. This job is better suited to tools that actually manage server-state and client-state. With that said, this doesn't mean that the router doesn't play a vital role in some mutation lifecycles.

## What should I use for data mutations?

There are a few different options for managing data mutations. Our recommendations are vast:

- [TanStack Actions](#tanstack-actions)
- [TanStack Query](https://tanstack.com/query/latest/docs/react/guides/mutations)
- [SWR](https://swr.vercel.app/)
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
- [urql](https://formidable.com/open-source/urql/)
- [Relay](https://relay.dev/)
- [Apollo](https://www.apollographql.com/docs/react/)

Or, even...

- [Zustand](https://zustand-demo.pmnd.rs/)
- [Jotai](https://jotai.org/)
- [Recoil](https://recoiljs.org/)
- [Redux](https://redux.js.org/)

Similar to data fetching, mutation state isn't a one-size-fits-all solution, so you'll need to pick a solution that fits your needs and your team's needs. We recommend trying out a few different solutions and seeing what works best for you.

## TanStack Actions

Just like a fresh Zelda game, we would never send you into the wild without a sword. We've created an extremely lightweight, framework agnostic action/mutation library called TanStack Actions that works really well with Router. It's a great place to start if you're not already using one of the more complex (but more powerful) tools above.

## What are data mutations?

From the context of routing, data mutations are usually related to **server state** or state that comes from an external, asynchronous source and is necessary to fetch before rendering some content. Data loading itself is covered in the [Data Loading](../data-loading) guide. This guide is about data mutations, or the process of triggering changes to that external state and displaying it's progress and effects to the user.

## Simple Data Mutations with TanStack Actions

Let's write a data mutation that will update a post on a server. We'll use TanStack Actions to manage this mutation.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  name: 'updatePost',
  async action(post: Post) {
    const response = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      body: JSON.stringify(post),
    })

    if (!response.ok) {
      throw new Error('Failed to update post')
    }

    return response.json()
  },
})
```

Now that we have our action, we can use it in our component. We'll use the `useAction` hook from `@tanstack/react-actions` to subscribe to the action state and use the action in our component.

```tsx
import { useAction } from '@tanstack/react-actions'

function PostEditor() {
  const params = useParams({ from: postEditRoute.id })
  const postLoader = useLoaderInstance({
    key: 'post',
    variables: params.postId,
  })

  const [postDraft, setPostDraft] = useState<Post>(() => postLoader.state.data)
  const updatePost = useAction({ action: updatePostAction })

  const latestPostSubmission = updatePost.state.latestSubmission

  return (
    <div>
      <input
        value={postDraft.title}
        onChange={(e) => setPostDraft({ ...postDraft, title: e.target.value })}
      />
      <button onClick={() => updatePost.submit(postDraft)}>Update Post</button>
    </div>
  )
}
```

## Data Loader Invalidation

So how does my data loader get the updated data? **Invalidation**. When you mutate data on the server, your data loading library needs to know that it might need to refetch some data. Depending on your data loading library and mutation library, this song and dance may differ, but we'll show you what it looks like with TanStack Actions.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  name: 'updatePost',
  async action(post: Post) {
    //...
  },
  onEachSuccess: () => {
    // Invalidate the posts loader. Depending on your data loading library,
    // this may result in an immediate refetch or it could simply mark
    // the data as stale and refetch it the next time it's used.
    postsLoader.invalidate()
  },
})
```

## Invalidating specific data

Again, we'll assume we're using TanStack Actions here, but it's also possible to use the action submission state to invalidate specific data. Let's update our action to invalidate a specific post.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  name: 'updatePost',
  async action(post: Post) {
    //...
  },
  onEachSuccess: (submission) => {
    // Use the submission payload to invalidate the specific post
    const post = submission.payload
    postsLoader.invalidate({ variables: post.id })
  },
})
```

## Invalidating entire data sets

It's very common to invalidate an entire subset of data based on a query key when some subset of that data changes e.g. Refetching all posts when a single post is edited. One of the best reasons to do this is that you can never really be sure of the side-effects a mutation will have on server-side data. It could remove/add elements, reorder them, or change their inclusion in specific filtered lists. TanStack Loaders comes with the `invalidateAll` method to invalidate all data for a given query key.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  name: 'updatePost',
  async action(post: Post) {
    //...
  },
  onEachSuccess: (submission) => {
    postsLoader.invalidateAll()
  },
})
```

## Displaying success/error states

When mutations are in flight, successful, or failed, it's important to display that information to the user. TanStack Actions makes this easy with the `latestSubmission` property on the action state. This property will always contain the latest submission state for the action. We can use this to display a loading indicator, success message, or error message.

```tsx
import { useAction } from '@tanstack/react-actions'

function PostEditor() {
  const params = useParams({ from: postEditRoute.id })
  const postLoader = useLoaderInstance({
    key: 'post',
    variables: params.postId,
  })

  const [postDraft, setPostDraft] = useState<Post>(() => postLoader.state.data)
  const updatePost = useAction({ action: updatePostAction })

  // Get the latest submission
  const latestPostSubmission = updatePost.state.latestSubmission

  return (
    <div>
      <input
        value={postDraft.title}
        onChange={(e) => setPostDraft({ ...postDraft, title: e.target.value })}
      />
      <button
        onClick={() => updatePost.submit(postDraft)}
        // Disable the button when the action is in flight
        disabled={latestPostSubmission.isLoading}
      >
        Update Post
      </button>
      {/* Show an error message if necessary */}
      {latestPostSubmission.state.status === 'error' && (
        <div className="error">{latestPostSubmission.state.error.message}</div>
      )}
      {/* Show a success message */}
      {latestPostSubmission.state.status === 'success' && (
        <div className="success">Post updated successfully!</div>
      )}
    </div>
  )
}
```

> ⚠️ Submission state is an interesting topic when it comes to persistence. Do you keep every mutation around forever? How do you know when to get rid of it? What if the user navigates away from the screen and then back? Please, read on :)

## Action/mutations can be augmented by router events

When actions are fired, regardless of the mutation library managing them, they create state related to the action submission. Most state managers will correctly keep this submission state around and expose it to make it possible to show UI elements like loading spinners, success messages, error messages, etc. Let's consider the following interactions:

- User navigates to the `/posts/123/edit` screen to edit a post
- User edits the `123` post and upon success, sees a success message below the editor that the post was updated
- User navigates to the `/posts` screen
- User navigates back to the `/posts/123/edit` screen again

Unless the state management library was made aware of the users movement, it's likely your submission state would still be around and your user would likely still see the **"Post updated successfully"** message. This is not ideal. Obviously our intent wasn't to keep this mutation state around forever, right?!

To solve this, TanStack Router provides navigation events that you can use to clear your action states when the user is no longer in need of them.

## The `onRouteChange` router option

One of the easiest ways of doing this is by utilizing the `onRouteChange` router option. This option is a function that is called whenever the router changes routes. It's important to understand that this truly means that the route is _changing_, not just reloading. If the router reloads or the user performs a URL altering action resulting in a new href, this function is called.

This is a great place to reset your old mutation/actions states. We'll use TanStack Actions to demonstrate how to do this.

```tsx
const updatePostAction = new Action({
  name: 'updatePost',
  async action(post: Post) {
    //...
  },
  onEachSuccess: (submission) => {
    postsLoader.invalidateAll()
  },
})

const router = new Router({
  //...
  onRouteChange: () => {
    // Reset the action state when the route changes
    updatePostAction.reset()
  },
})
```

## Learn more about TanStack Loaders/Actions!

There's plenty more to learn about TanStack Loaders (and Actions!). If you plan on using them with TanStack Router, it's highly recommended that you read through their documentation:

- [TanStack Loaders](https://tanstack.com/loaders)
- [TanStack Actions](https://tanstack.com/actions)
