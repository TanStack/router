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
