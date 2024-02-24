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

1. [**Route configuration boilerplate?**](#1-why-is-the-routers-configuration-done-this-way): You have to define your routes in a way that allows Typescript to infer the types of your routes as much as possible.
2. [**Typescript module declaration for the router?**](#2-declaring-the-router-instance-for-type-inference): You have to pass the `Router` instance to the rest of your application using Typescript's module declaration.
3. [**Why push for file-based routing over code-based?**](#3-why-is-file-based-routing-the-preferred-way-to-define-routes): We push for file-based routing as the preferred way to define your routes.

## 1. Why is the Router's configuration done this way?

When you want to leverage the Typescript's inference features to its fullest, you'll quickly realize that *Generics* are your best friend. And so, Tanstack Router uses Generics everywhere to ensure that the types of your routes are inferred as much as possible.

This means that you have to define your routes in a way that allows Typescript to infer the types of your routes as much as possible.

> Can I use JSX to define my routes?

Using JSX for defining your routes is **out of the question**, as Typescript will not be able infer the route configuration types of your router.

```tsx
// ⛔️ This is not possible
function App() {
  return (
    <Router>
      <Route path="/posts" component={PostsPage} />
      <Route path="/posts/$postId" component={PostIdPage} />
      {/* ... */}
    </Router>
    // ^? Typescript cannot infer the routes in this configuration
  );
}
```

And since this would mean that you'd have to manually type the `to` prop of the `<Link>` component and wouldn't catch any errors until runtime, it's not a viable option.

> Maybe I could define my routes as a tree of nested objects?

```tsx
// ⛔️ This file will just keep growing and growing...
const router = createRouter({
  routes: {
    posts: {
      component: PostsPage,     // /posts
      children: {
        "$postId": {
          component: PostIdPage // /posts/$postId
        }
      }
    },
    // ...
  }
})
```

At first glance, this seems like a good idea. It's easy to visualize the entire route hierarchy in one go. But this approach has a couple big downsides that make it not ideal for large applications:

* **It's not very scalable**: As your application grows, the tree will grow and become harder to manage. And since its all defined in one file, it can become very hard to maintain.
* **It's not great for code-splitting**: You'd have to manually code-split each component and then pass it into the `component` property of the route, further complicating the route configuration with an ever-growing route configuration file.

This only get worse as your begin to use more features of the router, such as nested context, loaders, search param validation, etc.

> So, what's the best way to define my routes?

What we found to be the best way to define your routes is to abstract the definition of the route configuration outside of the route-tree. Then stitch together your route configurations into a single cohesive route-tree that is then passed into the `createRouter` function.

You can read more about [code-based routing](/docs/framework/react/guide/code-based-routing) to see how to define your routes in this way.

> 🙋🏼 Finding Code-based routing to be a bit too cumbersome? See why [file-based routing](#3-why-is-file-based-routing-the-preferred-way-to-define-routes) is the preferred way to define your routes.

## 2. Declaring the Router instance for type inference

> Why do I have to declare the `Router`?

> This declaration stuff is way too complicated for me...

Once you've constructed your routes into a tree and passed it into your Router instance (using `createRouter`) with all the generics working correctly, you then need to somehow pass this information to the rest of your application.

There were two approaches we considered for this:

1. **Imports**: You could import the `Router` instance from the file where you created it and use it directly in your components.

```tsx
import { router } from '@/src/app'
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
// src/app.tsx
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

And then you can benefit from its auto-complete anywhere in your app without having to import it.

```tsx
export const PostsIdLink = () => {
 return (
    <Link
      to='/posts/$postId'
      // ^? Typescript will auto-complete this for you
      params={{ postId: '123' }} // and this too!
    >
      Go to post 123
    </Link>
 )
}
```

We went with **module declaration**, as it is what we found to be the most scalable and maintainable approach with the least amount of overhead and boilerplate.

## 3. Why is file-based routing the preferred way to define routes?

foo