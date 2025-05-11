import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/params-ps/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div>
      <h3 className="pb-2">Named path params</h3>
      <ul className="grid mb-2">
        <li>
          <Link
            data-testid="l-to-named-foo"
            to="/params-ps/named/$foo"
            params={{ foo: 'foo' }}
          >
            /params-ps/named/$foo
          </Link>
        </li>
        <li>
          <Link
            data-testid="l-to-named-prefixfoo"
            to="/params-ps/named/prefix{$foo}"
            // @ts-expect-error
            params={{ foo: 'foo' }}
          >
            /params-ps/named/{'prefix{$foo}'}
          </Link>
        </li>
        <li>
          <Link
            data-testid="l-to-named-foosuffix"
            to="/params-ps/named/{$foo}suffix"
            // @ts-expect-error
            params={{ foo: 'foo' }}
          >
            /params-ps/named/{'{$foo}suffix'}
          </Link>
        </li>
      </ul>
      <hr />
      <h3 className="pb-2">Wildcard path params</h3>
      <ul className="grid mb-2">
        <li>
          <Link
            data-testid="l-to-wildcard-foo"
            to="/params-ps/wildcard/$"
            params={{ _splat: 'foo' }}
          >
            /params-ps/wildcard/$
          </Link>
        </li>
        <li>
          <Link
            data-testid="l-to-wildcard-prefixfoo"
            to="/params-ps/wildcard/prefix{$}"
            // @ts-expect-error
            params={{ _splat: 'foo' }}
          >
            /params-ps/wildcard/{'prefix{$}'}
          </Link>
        </li>
        <li>
          <Link
            data-testid="l-to-wildcard-foosuffix"
            to="/params-ps/wildcard/{$}suffix"
            // @ts-expect-error
            params={{ _splat: 'foo' }}
          >
            /params-ps/wildcard/{'{$}suffix'}
          </Link>
        </li>
      </ul>
    </div>
  )
}
