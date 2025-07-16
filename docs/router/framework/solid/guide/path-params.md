---
ref: docs/router/framework/react/guide/path-params.md
replace:
  {
    'react-router': 'solid-router',
    '{ postId } = Route.useParams()': 'params = Route.useParams()',
    '{postId}': '{params.postId()}',
  }
---
