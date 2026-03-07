import { useNavigate } from '@tanstack/solid-router'
import { fallback, zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'
import { Loading } from 'solid-js'
import { Header } from '../../components/Header'
import { Users, usersQueryOptions } from '../../components/Users'
import { Content } from '../../components/Content'
import { Search } from '../../components/Search'

const Zod = () => {
  const search = Route.useSearch({
    select: (search) => search.search ?? '',
  })
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <>
      <Header title="Zod" />
      <Content>
        <Search
          search={search()}
          onChange={(search) => navigate({ search: { search }, replace: true })}
        />
        <Loading>
          <Users search={search()} />
        </Loading>
      </Content>
    </>
  )
}

export const Route = createFileRoute({
  validateSearch: zodValidator(
    z.object({
      search: fallback(z.string().optional(), undefined),
    }),
  ),
  loaderDeps: (opt) => ({ search: opt.search }),
  loader: (opt) => {
    opt.context.queryClient.ensureQueryData(
      usersQueryOptions(opt.deps.search.search ?? ''),
    )
  },
  component: Zod,
})
