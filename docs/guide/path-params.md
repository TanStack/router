---
title: Path Params
---

Path params are used to match a single segment (the text until the next `/`) and provide its value back to you as a **named** variable. They are defined by using the `:` character in the path, followed by the key variable to assign it to. The following are valid path param paths:

- `:postId`
- `:name`
- `:teamId`
- `about/:name`
- `team/:teamId`
- `blog/:postId`

Because path param routes only match to the next `/`, child routes can be created to continue expressing hierarchy:

TODO
