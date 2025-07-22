---
ref: docs/router/framework/react/guide/path-params.md
replace:
  {
    'react-router': 'solid-router',
    '{ postId } = Route.useParams()': 'params = Route.useParams',
    '{ fileName } = Route.useParams()': 'params = Route.useParams',
    '{ userId } = Route.useParams()': 'params = Route.useParams',
    '{ _splat } = Route.useParams()': 'params = Route.useParams',
    '{postId}': '{params.postId()}',
    '{userId}': '{params.userId()}',
    '{fileName}': '{params.userId()}',
    '{_splat}': '{params._splat()}',
  }
---
