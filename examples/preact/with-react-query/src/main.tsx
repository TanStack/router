import { render } from "preact";
import {
  createReactRouter,
  createRouteConfig,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import axios from "axios";

type PostType = {
  id: string;
  title: string;
  body: string;
};

const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({
    path: "/",
    component: Index,
  }),
  createRoute({
    path: "posts",
    component: Posts,
    errorElement: "Oh crap!",
    loader: async () => {
      queryClient.getQueryData(["posts"]) ??
        (await queryClient.prefetchQuery(["posts"], fetchPosts));
      return {};
    },
  }).createChildren((createRoute) => [
    createRoute({ path: "/", component: PostsIndex }),
    createRoute({
      path: ":postId",
      component: Post,
      loader: async ({ params: { postId } }) => {
        queryClient.getQueryData(["posts", postId]) ??
          (await queryClient.prefetchQuery(
            ["posts", postId],
            () => fetchPostById(postId),
          ));
        return {};
      },
    }),
  ]),
]);

// Set up a ReactRouter instance
const router = createReactRouter({
  routeConfig,
  defaultPreload: "intent",
});

const queryClient = new QueryClient();

function App() {
  return (
    // Build our routes and render our router
    <>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router}>
          <div>
            <router.Link
              to="/"
              activeProps={{
                className: "font-bold",
              }}
              activeOptions={{ exact: true }}
            >
              Home
            </router.Link>{" "}
            <router.Link
              to="/posts"
              activeProps={{
                className: "font-bold",
              }}
            >
              Posts
            </router.Link>
          </div>
          <hr />
          <Outlet /> {/* Start rendering router matches */}
        </RouterProvider>
        <TanStackRouterDevtools router={router} position="bottom-right" />
        <ReactQueryDevtools initialIsOpen position="bottom-right" />
      </QueryClientProvider>
    </>
  );
}

async function fetchPosts() {
  console.log("Fetching posts...");
  await new Promise((r) => setTimeout(r, 500));
  return axios
    .get<PostType[]>("https://jsonplaceholder.typicode.com/posts")
    .then((r) => r.data.slice(0, 10));
}

async function fetchPostById(postId: string) {
  console.log(`Fetching post with id ${postId}...`);
  await new Promise((r) => setTimeout(r, 500));

  return await axios
    .get<PostType>(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data);
}

function usePosts() {
  return useQuery(["posts"], fetchPosts);
}

function usePost(postId: string) {
  return useQuery(["posts", postId], () => fetchPostById(postId), {
    enabled: !!postId,
  });
}

function Index() {
  return (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  );
}

function Posts() {
  const { Link } = router.useMatch("/posts");

  const postsQuery = usePosts();

  return (
    <div>
      <div
        style={{
          float: "left",
          marginRight: "1rem",
        }}
      >
        {postsQuery.data?.map((post) => {
          return (
            <div key={post.id}>
              <Link
                to="/posts/:postId"
                params={{
                  postId: post.id,
                }}
                activeProps={{ className: "font-bold" }}
              >
                <pre>{post.title.substring(0, 20)}</pre>
              </Link>
            </div>
          );
        })}
      </div>
      <hr />
      <Outlet />
    </div>
  );
}

function PostsIndex() {
  return (
    <>
      <div>Select a post.</div>
    </>
  );
}

function Post() {
  const { params } = router.useMatch("/posts/:postId");
  const postQuery = usePost(params.postId);

  return (
    <div>
      <h4>{postQuery.data?.title}</h4>
      <p>{postQuery.data?.body}</p>
    </div>
  );
}

render(<App />, document.getElementById("app") as HTMLElement);
