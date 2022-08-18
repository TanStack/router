---
title: Search Params
---

Similar to how TanStack Query made handling server-state in your React applications a breeze, TanStack Router aims to **unlocks the power of URL search params**.

Most applications, even large ones will get away with requiring only a few string-based search query params in the URL, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is that while it may not fit the hierarchical patterns of the pathname section of the URL, it's still very important to the output of a page. Both the ability to consume these search params and manipulate them without restriction is paramount to your app's developer and user experience. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

When you begin to store more state in the URL you will inevitably and naturally want to reach for JSON to store it. Storing JSON state in the URL has its own complications involving:

- Route Matching. Path matching for routes is really only a small part of what a decently designed route tree can do. Being able to match on search params (in its many flavors) should not be considered a "plugin" or afterthought. It should be one of the most integrated and powerful parts of the API.
- Parsing/Serialization. I'm talking about full-customization here; BYO stringifier/parser.
- Immutability & Structural Sharing. This one is tricky to explain, but essentially it will save you from the inevitable infinite side-effect rerenders.
- Compression & Readability. While not out-of-the-box, this is usually desired, so making it simple to get should be as simple as including a library.
- Low-level declarative APIs to manipulate query state (think `<Link>`, `<Navigate>` and `useNavigate`). This is one where most routers can't or won't go. To do this correctly, you have to buy into your search-param APIs wholesale at the core of the architecture and provide them as a consistent experience through the entire library.

Let's just say TanStack Router doesn't skimp on search params. It handles all of this out of the box and goes the extra mile!

TODO
