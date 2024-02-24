---
title: DX Design Decisions
---

When people first start using Tanstack Router, they often have a lot of questions that revolve around the following themes:

> Why do I have to do things this way?

> Why is it done this way? and not that way?

> I'm used to doing it this way, why should I change?

And they are all valid questions. For the most part, people are used to using routing libraries that are very similar to each other. They all have a similar API, similar concepts, and similar ways of doing things.

But Tanstack Router is different. It's not your average routing library. It's not your average state management library. It's not your average anything.

## Tanstack Router's origin story

It's important remember that Tanstack Router's origins stem from [Nozzle.io](https://nozzle.io)'s need for a client-side routing solution that offered a first-in-class *URL Search Parameters* experience without compromising on the ***type-safety*** that was required to power its complex dashboards.

And so, from Tanstack Router's very inception, every facet of it's design was meticulously thought out to ensure that its type-safety and developer experience were second to none.

## How does Tanstack Router achieve this?

> Typescript! Typescript! Typescript!

Every aspect of Tanstack Router is designed to be as type-safe as possible, and this is achieved by leveraging Typescript's type system to its fullest extent. This involves using some very advanced and complex types, type inference, and other features to ensure that the developer experience is as smooth as possible.

But to achieve this, we had to make some decisions that deviate from the norms in the routing world.

## Why is the Route configuration done this way?

When you want to leverage the Typescript's inference features to its fullest, you'll quickly realize that *Generics* are your best friend. And so, Tanstack Router uses Generics everywhere to ensure that the types of your routes are inferred as much as possible.

Once you've constructed your routes into a tree and passed it into your Router instance (using `createRouter`) with all the generics working correctly, you then need to somehow pass this information to the rest of your application.

There were two approaches we considered for this:

1. **Imports**: You could import the `Router` instance from the file where you created it and use it directly in your components.

```tsx
import { router } from '@/config/router';
export const PostsIdLink = () => {
 return (
   <Link<typeof router>
     to='/posts/$postId'
     params={{ postId: '123' }}
   >
     Go to post 123
   </Link>
 )
}
```
A downside to this approach is that you'd have to import the entire `Router` instance into every file where you want to use it. This can lead to increased bundle sizes and can be cumbersome to manage, and only get worse as your application grows and you use more features of the router.

2. **Module declaration**: You can use Typescript's module declaration to declare the `Router` instance as a module that can be used for type inference anywhere in your application without having to import it.

You'll do this once in your application.
```tsx
// src/config/router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```
And then you can use it anywhere in your application without having to import it.
```tsx
export const PostsIdLink = () => {
 return (
   <Link
     to='/posts/$postId'
     params={{ postId: '123' }}
   >
     Go to post 123
   </Link>
 )
}
```

**Module declaration** is what we went with, as it allows you to easily access the `Router` instance from anywhere in your application without having to import it.



### Why can't I use JSX to define my routes?

> Why not? I'm used to defining my routes like this:

```tsx
function App() {
  return (
    <Router>
      <Route path="/posts" component={PostsPage} />
      <Route path="/posts/$postId" component={PostIdPage} />
    </Router>
  );
}
```

Something like this is very common in the routing world. But it has no way of being type-safe, because Typescript will not be able to infer the types of the `/posts` and `/posts/$postId` routes since they are just lone React components. So, when you are creating a `<Link>` to these routes, you'll have to manually type the `to/href` prop.

### Ok then, why can't I define my routes as a tree of nested objects?

> This seems way easier to me, and lets me easily view the entire route hierarchy in one go.

```tsx
const router = createRouter({
  posts: {
    component: PostsPage,     // /posts
    children: {
      "$postId": {
        component: PostIdPage // /posts/$postId
      }
    }
  }
})
```