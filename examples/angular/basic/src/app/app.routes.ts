import { rootRoute } from './root';
import { indexRoute } from './home/index';
import { postsLayoutRoute } from './posts/layout';
import { postRoute } from './posts/post';
import { postsIndexRoute } from './posts/index';
import { nestedPathlessLayout2Route } from './pathless/nested';
import { pathlessLayoutRoute } from './pathless/a-layout';
import { pathlessLayoutARoute } from './pathless/a';
import { pathlessLayoutBRoute } from './pathless/b';

export const routeTree = rootRoute.addChildren([
  postsLayoutRoute.addChildren([postRoute, postsIndexRoute]),
  pathlessLayoutRoute.addChildren([
    nestedPathlessLayout2Route.addChildren([
      pathlessLayoutARoute,
      pathlessLayoutBRoute,
    ]),
  ]),
  indexRoute,
])
