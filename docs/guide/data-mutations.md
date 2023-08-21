---
title: Data Mutations
---

## The Router's Role in Data Mutations

Data mutations in our applications can take on many forms. They can be simple actions like updating a user's profile, or they can be complex, multi-step processes like creating a new user. Regardless of the complexity, the router plays an important and simple role in data mutations: **It should reset any state related to the mutation when the mutation is complete**.

This is a simple concept, but it's important to understand why it's important. Let's consider the following interactions:

- User navigates to the `/posts/123/edit` screen to edit a post
- A list of posts is visible in the sidebar rendered by the `/posts` route
- User edits the `123` post's title and upon success, sees a success message below the editor that the post was updated
- The user **should now see the updated post title in the sidebar**

This is a simple expectation, but requires a bit of coordination between the router and the data mutation logic used to update the post. Let's consider the following interactions. Let's create a simple hook-based mutation with a promise flow to update the post and then **invalidate the router's matches when the mutation is complete**:

```tsx
function useUpdatePost() {
  const router = useRouter()

  return React.useCallback(async (post: Post) => {
    const response = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      body: JSON.stringify(post),
    }).then((response) => {
      if (!response.ok) {
        throw new Error('Failed to update post')
      }

      // Invalidate the router's matches
      router.invalidateMatches()
    })
  }, [])
}
```

## What should I use for data mutations?

We wouldn't recommend using the above pattern for data mutations as there are many mutation patterns that are not covered by such a simple example.

Things that a data mutation library should consider:

- Saving and handling submission state
- Providing optimistic update support
- Built-in hooks to wire up invalidation (or automatically support it)
- Handling multiple in-flight mutations at once
- Organizing mutation state as a globally accessible resource
- Submission state history and garbage collection

There are a few different options for managing data mutations, here are our recommendations!

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

Just like a fresh Zelda game, we would never send you into the wild without a sword _(fine... BotW and TotK bend this rule to varying degrees, but since they're the greatest games ever created, we'll let the lore slide a bit)_.

We've created an extremely lightweight, framework agnostic action/mutation library called TanStack Actions that works really well with Router. It's a great place to start if you're not already using one of the more complex (but more powerful) tools above.

## What are data mutations?

From the context of routing, data mutations are usually related to **server state** or state that comes from an external, asynchronous source and is necessary to fetch before rendering some content. Data loading itself is covered in the [Data Loading](../data-loading) guide. This guide is about data mutations, or the process of triggering changes to that external state and displaying it's progress and effects to the user.

## Simple Data Mutations with TanStack Actions

Let's write a data mutation that will update a post on a server. We'll use TanStack Actions to manage this mutation.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  key: 'updatePost',
  fn: async (post: Post) => {
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

const actionClient = new ActionClient()
```

Now that we have our action, we can use it in our component. We'll use the `useAction` hook from `@tanstack/react-actions` to subscribe to the action state and use the action in our component.

```tsx
import { useAction } from '@tanstack/react-actions'

function App() {
  return (
    <ActionClientProvider client={actionClient}>
      <PostEditor post={post} />
    </ActionClientProvider>
  )
}

function PostEditor({ post }: { post: Post }) {
  const [postDraft, setPostDraft] = useState<Post>(() => post)
  const [updatePostAction, updatePost] = useAction({ key: 'updatePost' })
  const latestPostSubmission = updatePostAction.state.latestSubmission

  return (
    <div>
      <input
        value={postDraft.title}
        onChange={(e) => setPostDraft({ ...postDraft, title: e.target.value })}
      />
      <button onClick={() => updatePost(postDraft)}>Update Post</button>
    </div>
  )
}
```

## Data Invalidation

So how does my data loader get the updated data? **Invalidation**. When you mutate data on the server, your data loading library needs to know that it might need to refetch some data. Depending on your data loading library and mutation library, this song and dance may differ, but we'll show you what it looks like if you're using the built-in loaders from TanStack Router.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  key: 'updatePost',
  fn: async (post: Post) => {
    //...
  },
  onEachSuccess: () => {
    // Invalidate the router's matches
    router.invalidate()
  },
})
```

## Invalidating specific data

For this example, let's assume we're using TanStack Actions here where it's possible to use the action submission state to invalidate specific data. Let's update our action to invalidate a specific post loader instance using the loader's `invalidateInstance` method.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  key: 'updatePost',
  fn: async (post: Post) => {
    //...
  },
  onEachSuccess: (submission) => {
    // Use the submission payload to invalidate the specific post
    const post = submission.payload
    loaderClient.invalidateInstance({ key: 'post', variables: post.id })
  },
})
```

## Invalidating entire data sets

It's very common to invalidate an entire subset of data based on hierarchy when some subset of that data changes e.g. **This is the default functionality for `router.invalidate()`**:

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  key: 'updatePost',
  fn: async (post: Post) => {
    //...
  },
  onEachSuccess: (submission) => {
    // Invalidate everything
    router.invalidate()
  },
})
```

If you're using an external library like TanStack Loaders, you're method might be different. Here, we'll use TanStack Loaders `invalidateLoader` method to invalidate all posts when a single post is edited.

```tsx
import { Action } from '@tanstack/actions'

const updatePostAction = new Action({
  key: 'updatePost',
  fn: async (post: Post) => {
    //...
  },
  onEachSuccess: (submission) => {
    loaderClient.invalidateLoader({ key: 'post' })
  },
})
```

## Displaying success/error states

When mutations are in flight, successful, or failed, it's important to display that information to the user. TanStack Actions makes this easy with the `latestSubmission` property on the action state. This property will always contain the latest submission state for the action. We can use this to display a loading indicator, success message, or error message.

```tsx
import { useAction } from '@tanstack/react-actions'

function PostEditor({ post }: { post: Post }) {
  const [postDraft, setPostDraft] = useState<Post>(() => post)
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

> ⚠️ Submission state is an interesting topic when it comes to persistence. Do you keep every mutation around forever? How do you know when to get rid of it? What if the user navigates away from the screen and then back? Let's dig in!

## Action/mutations can be augmented by router events

When actions are fired, regardless of the mutation library managing them, they create state related to the action submission. Most state managers will correctly keep this submission state around and expose it to make it possible to show UI elements like loading spinners, success messages, error messages, etc. Let's consider the following interactions:

- User navigates to the `/posts/123/edit` screen to edit a post
- User edits the `123` post and upon success, sees a success message below the editor that the post was updated
- User navigates to the `/posts` screen
- User navigates back to the `/posts/123/edit` screen again

Without notifying your mutation management library about the route change, it's likely your submission state will still be around and your user would still see the **"Post updated successfully"** message when they return to the previous screen. This is not ideal. Obviously, our intent wasn't to keep this mutation state around forever, right?!

To solve this, we can use TanStack Router's `onRouteChange` option to clear your action states when the user is no longer in need of them.

## The `onRouteChange` router option

This option is a function that is called whenever the router successfully loads a different route. It's important to understand that this truly means that the route is _changing_, and not just reloading the same route. If the router reloads or the user performs a URL altering action resulting in a new href, this function is called.

This is a great place to reset your old mutation/actions states. We'll use TanStack Actions to demonstrate how to do this.

```tsx
const updatePostAction = new Action({
  key: 'updatePost',
  fn: async (post: Post) => {
    //...
  },
  onEachSuccess: (submission) => {
    loaderClient.invalidateLoader({ key: 'posts' })
  },
})

const actionClient = new ActionClient({
  actions: [updatePostAction],
})

const router = new Router({
  //...
  onRouteChange: () => {
    // Reset the action state when the route changes
    actionClient.clearAll
  },
})
```

This will clear all non-pending submissions from history for all actions on the client. You can also use the `actionClient.clearAction()` method to clear the submissions for a specific action.

## Learn more about TanStack Loaders/Actions!

There's plenty more to learn about TanStack Loaders (and Actions!). If you plan on using them with TanStack Router, it's highly recommended that you read through their documentation:

- [TanStack Loaders](https://tanstack.com/loaders)
- [TanStack Actions](https://tanstack.com/actions)
