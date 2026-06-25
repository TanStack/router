import { rootRoute } from './routes/__root'
import { workspaceRoute } from './routes/workspace'
import { orgRoute } from './routes/workspace.$orgId'
import { projectsRoute } from './routes/workspace.$orgId.projects'
import { projectRoute } from './routes/workspace.$orgId.projects.$projectId'
import { boardRoute } from './routes/workspace.$orgId.projects.$projectId.boards.$boardId'
import { cardRoute } from './routes/workspace.$orgId.projects.$projectId.boards.$boardId.cards.$cardId'

export const routeTree = rootRoute.addChildren([
  workspaceRoute.addChildren([
    orgRoute.addChildren([
      projectsRoute.addChildren([
        projectRoute.addChildren([boardRoute.addChildren([cardRoute])]),
      ]),
    ]),
  ]),
])
