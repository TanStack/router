import { Link, useParams, useSearch } from '@tanstack/react-router'

const probes = Array.from({ length: 24 }, (_, index) => index)

function ParamsProbe({ index }: { index: number }) {
  const params = useParams({
    strict: false,
  })

  return (
    <span hidden>
      {index}:{String(params.a ?? '')}/{String(params.d ?? '')}
    </span>
  )
}

function SearchProbe({ index }: { index: number }) {
  const search = useSearch({
    strict: false,
  })

  return (
    <span hidden>
      {index}:{String(search.q ?? search.filter ?? search.page ?? '')}
    </span>
  )
}

function LinkProbe({ salt }: { salt: number }) {
  const value = String((salt % 97) + 1)

  return (
    <Link
      to="/$a/$b/$c/$d"
      params={{
        a: `a-${value}`,
        b: `b-${value}`,
        c: `c-${value}`,
        d: `d-${value}`,
      }}
      search={{ filter: 'link', page: salt % 25, q: `q-${value}` }}
      preload={false}
    >
      Link {value}
    </Link>
  )
}

export function RouteWorkload() {
  return (
    <main>
      {probes.map((probe) => (
        <ParamsProbe key={`params-${probe}`} index={probe} />
      ))}
      {probes.map((probe) => (
        <SearchProbe key={`search-${probe}`} index={probe} />
      ))}
      <nav>
        {probes.map((probe) => (
          <LinkProbe key={`link-${probe}`} salt={probe + 201} />
        ))}
      </nav>
    </main>
  )
}
