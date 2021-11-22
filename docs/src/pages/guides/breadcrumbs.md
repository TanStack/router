---
id: breadcrumbs
title: Bread Crumbs
---

## Leveraging `route.meta`

We can store anything in `route.meta` - including components! We can set a breadcrumb function that would render a Link for each route.

```tsx
type LocationGenerics = MakeGenerics<{
  Params: {
    teamId: string
  },
  RouteMeta: {
    breadcrumb: (params: LocationGenerics['Params']) => React.ReactElement
  }
}>

const routes: Route<LocationGenerics>[] = [
  {
    path: '/',
    element: <Home />,
  },
  {
    path: 'teams',
    element: <Teams />,
    meta: {
      breadcrumb: () => 'Teams'
    },
    children: [
      {
        path: ':teamId',
        element: <Team />,
        meta: {
          breadcrumb: (params) => params.teamId
        }
      }
    ]
  }
];
```

We can access this meta property from a route match. We will use the `useMatches` hook to get access to all route matches and render a list of breadcrumbs.

```tsx
function Breadcrumbs() {
  const matches = useMatches()

  return (
    <ol>
      {matches
        // skip routes that don't have a breadcrumb, like is the case of our '/' route 
        .filter(match => match.route.meta?.breadcrumb)
        .map(match => (
          <li key={match.pathname}>
            <Link to={match.pathname}>
              {match.route.meta!.breadcrumb(match.params)}
            </Link>
          </li>
        ))
      }
    </ol>
  )
}
```

Since our breadcrumbs are components, we can use the match data and render something a little bit more intuitive than just the team's ID.

```tsx
// we can fetch the team and render the team name instead
function TeamBreadcrumb({ teamId }: { teamId: string }) {
  const team = useTeam(teamId)
  return <>{team?.name}</>
}

const routes = [
  // ...
      {
        path: ':teamId',
        element: <Team />,
        meta: {
          breadcrumb: (params) => <TeamBreadcrumb teamId={teamId} />
        }
      }
]
```
