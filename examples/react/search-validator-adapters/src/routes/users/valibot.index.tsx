import * as React from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { valibotSearchValidator } from '@tanstack/router-valibot-adapter'
import * as v from 'valibot'
import { Header } from '../../components/Header'
import { Users, usersQueryOptions } from '../../components/Users'
import { Content } from '../../components/Content'
import { Search } from '../../components/Search'

const Valibot = () => {
  const search = Route.useSearch({
    select: (search) => search.search ?? '',
  })
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <>
      <Header title="Valibot" />
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

export const Route = createFileRoute('/users/valibot/')({
  validateSearch: valibotSearchValidator(
    v.object({
      search: v.fallback(v.optional(v.string()), undefined),
    }),
  ),
  loaderDeps: (opt) => ({ search: opt.search }),
  loader: (opt) => {
    opt.context.queryClient.ensureQueryData(
      usersQueryOptions(opt.deps.search.search ?? ''),
    )
  },
  component: Valibot,
})
