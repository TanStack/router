import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { arkTypeSearchValidator } from '@tanstack/router-arktype-adapter'
import { type } from 'arktype'
import { Header } from '../../components/Header'
import { Users, usersQueryOptions } from '../../components/Users'
import { Content } from '../../components/Content'
import { Search } from '../../components/Search'

const ArkType = () => {
  const search = Route.useSearch({
    select: (search) => search.search ?? '',
  })
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <>
      <Header title="ArkType" />
      <Content>
        <Search
          search={search}
          onChange={(search) => navigate({ search: { search }, replace: true })}
        />
        <React.Suspense>
          <Users search={search} />
        </React.Suspense>
      </Content>
    </>
  )
}

export const Route = createFileRoute('/users/arktype/')({
  validateSearch: arkTypeSearchValidator(
    type({
      'search?': 'string',
    }),
  ),
  loaderDeps: (opt) => ({ search: opt.search }),
  loader: (opt) => {
    opt.context.queryClient.ensureQueryData(
      usersQueryOptions(opt.deps.search.search ?? ''),
    )
  },
  component: ArkType,
})
