import { createRouteMask } from '@tanstack/solid-router'
import { rootRoute } from './routes/__root'
import { photoDetailRoute } from './routes/photos.$photoId'
import { photoModalRoute } from './routes/photos.$photoId.modal'
import { photosRoute } from './routes/photos'
import { settingsProfileRoute } from './routes/settings.profile'
import { teamProjectRoute } from './routes/teams.$teamId.projects.$projectId'

export const routeTree = rootRoute.addChildren([
  photosRoute,
  photoDetailRoute,
  photoModalRoute,
  settingsProfileRoute,
  teamProjectRoute,
])

export const photoModalMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: true,
  search: { page: 1, filter: 'masked', layout: 'detail' },
  state: { scenario: 'masking-rewrites', mask: 'photo-modal' } as any,
  unmaskOnReload: true,
})
