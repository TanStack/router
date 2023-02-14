import { Loader as _Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { Outlet } from '@tanstack/react-router'

import { loaderDelayFn } from '@/utils/common'
import { fetchRandomNumber } from '@/utils/mock'

export const Loader = new _Loader({
  key: 'random',
  loader: () => {
    return fetchRandomNumber()
  },
})

export const Config = {
  onLoad: async () => {
    return loaderDelayFn(() => {
      return {
        random: Math.random(),
      }
    })
  },
}

export default function LayoutWrapper() {
  const loaderInstance = useLoaderInstance({ key: Loader.key })
  const random = loaderInstance.state.data

  return (
    <div>
      <div>Layout</div>
      <div>{'Random #: ' + random}</div>
      <hr />
      <Outlet />
    </div>
  )
}
