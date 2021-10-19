/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  Link,
  Loader,
  ReactLocation,
  ReactLocationProvider,
  Routes,
  useRoute,
  useRouterState,
  useResolvePath,
} from "react-location";

//

type Post = {
  id: string;
  title: string;
  body: string;
};

type FetchPolicy = "cache-and-network" | "cache-first" | "network-only";

//

const createRouteDataCache = () => {
  let cache: Record<
    string,
    { updatedAt: number; ready: boolean; promise?: Promise<any>; data?: any }
  > = {};

  return {
    createLoader(
      loader: Loader,
      opts?: {
        maxAge?: number;
        policy?: FetchPolicy;
      }
    ) {
      const maxAge = opts?.maxAge ?? 0;
      const policy = opts?.policy ?? "cache-and-network";

      const cachedLoader: Loader = async (match, options) => {
        // Cache on pathname
        const key = match.pathname;

        // No cache? Create it.
        if (!cache[key]) {
          cache[key] = {
            updatedAt: 0,
            ready: false,
            promise: null!,
          };
        }

        const doFetch = () => {
          options.dispatch({ type: "loading" });
          return loader(match, options)
            .then((data: any) => {
              cache[key].updatedAt = Date.now();
              cache[key].data = data;
              cache[key].ready = true;
              options.dispatch({ type: "resolve", data });
              return data;
            })
            .catch((err: any) => {
              options.dispatch({ type: "reject", error: err });
              throw err;
            });
        };

        if (policy === "network-only") {
          return await doFetch();
        }

        if (!cache[key].updatedAt) {
          await doFetch();
        }

        if (policy === "cache-first") {
          return cache[key].data;
        }

        if (Date.now() - cache[key].updatedAt > maxAge) {
          doFetch();
        }

        return cache[key].data;
      };

      return cachedLoader;
    },
    invalidate: () => {
      cache = {};
    },
  };
};

const routeCache = createRouteDataCache();

const location = new ReactLocation();

function App() {
  return (
    <ReactLocationProvider location={location}>
      <Routes
        pendingElement="..."
        routes={[
          {
            path: "/",
            element: <Posts />,
            loader: routeCache.createLoader(
              async () => ({
                posts: await fetchPosts(),
              }),
              { maxAge: 5000 }
            ),
          },
          {
            path: ":postId",
            element: <Post />,
            loader: routeCache.createLoader(async ({ params: { postId } }) => ({
              post: await fetchPostById(postId),
            })),
          },
        ]}
      />
    </ReactLocationProvider>
  );
}

function Posts() {
  const {
    data: { posts },
    isLoading,
  } = useRoute<{ posts: Post[] }>();
  const resolvePath = useResolvePath();
  const routerState = useRouterState();

  return (
    <div>
      <h1>Posts {isLoading ? "..." : ""}</h1>
      <div>
        {posts.map((post) => (
          <p key={post.id}>
            <Link to={`./${post.id}`}>
              {post.title}{" "}
              {routerState.nextLocation?.pathname === resolvePath(post.id)
                ? "..."
                : ""}
            </Link>
          </p>
        ))}
      </div>
    </div>
  );
}

function Post() {
  const {
    data: { post },
    isLoading,
  } = useRoute<{ post: Post }>();
  const resolvePath = useResolvePath();
  const routerState = useRouterState();

  return (
    <div>
      <div>
        <Link to="..">
          Back{" "}
          {routerState.nextLocation?.pathname === resolvePath("..")
            ? "..."
            : ""}
        </Link>
      </div>
      <h1>
        {post.title} {isLoading ? "..." : ""}
      </h1>
      <div>
        <p>{post.body}</p>
      </div>
    </div>
  );
}

async function fetchPosts() {
  await new Promise((r) => setTimeout(r, 2000));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/posts"
  );
  return data;
}

async function fetchPostById(id: string) {
  await new Promise((r) => setTimeout(r, 2000));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return { ...data, body: data.body + " " + Math.random() };
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
