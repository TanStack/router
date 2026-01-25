import { Outlet, createFileRoute } from '@tanstack/react-router'
import { RenderData, makeData } from '~/data'

export const Route = createFileRoute('/ssr/data-only')({
  ssr: 'data-only',
  beforeLoad: () => {
    return makeData()
  },
  loader: ({ context }) => {
    return context
  },
  component: () => {
    const context = Route.useRouteContext()
    const loaderData = Route.useLoaderData()

    const localData = makeData()
    const expectedHonkState = localData.car.singleInstance.honk()

    const honkState = loaderData.car.singleInstance.honk()

    const exepctedAsyncHonkState = localData.asyncCar.singleInstance.honk()
    const asyncHonkState = loaderData.asyncCar.singleInstance.honk()

    return (
      <div data-testid="data-only-container">
        <h2 data-testid="data-only-heading">data-only</h2>
        <div>
          context: <RenderData id="context" data={context} />
        </div>
        <hr />
        <div>
          loader: <RenderData id="loader" data={loaderData} />
        </div>
        <hr />
        <div data-testid="honk-container">
          <h3>honk</h3>
          <div>
            expected:{' '}
            <div data-testid="honk-expected-state">
              {JSON.stringify(expectedHonkState)}
            </div>
          </div>
          <div>
            actual:{' '}
            <div data-testid="honk-actual-state">
              {JSON.stringify(honkState)}
            </div>
          </div>
        </div>
        <hr />
        <div data-testid="async-honk-container">
          <h3>async car honk</h3>
          <div>
            expected:{' '}
            <div data-testid="async-honk-expected-state">
              {JSON.stringify(exepctedAsyncHonkState)}
            </div>
          </div>
          <div>
            actual:{' '}
            <div data-testid="async-honk-actual-state">
              {JSON.stringify(asyncHonkState)}
            </div>
          </div>
        </div>
        <Outlet />
      </div>
    )
  },
  pendingComponent: () => <div>posts Loading...</div>,
})
