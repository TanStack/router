/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  Link,
  ReactLocation,
  ReactLocationProvider,
  Routes,
  useRoute,
  useRouterState,
  useResolvePath,
} from "react-location";
import { ReactLocationSimpleCache } from "react-location-simple-cache";

//

type Post = {
  id: string;
  title: string;
  body: string;
};

const routeCache = new ReactLocationSimpleCache();
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
            loader: routeCache.createLoader(async () => ({
              posts: await fetchPosts(),
            })),
          },
          {
            path: ":postId",
            element: <Post />,
            loader: routeCache.createLoader(
              async ({ params: { postId } }) => ({
                post: await fetchPostById(postId),
              }),
              {
                maxAge: 1000 * 10, // 10 seconds
              }
            ),
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
  } = useRoute<unknown, { posts: Post[] }>();
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
  } = useRoute<unknown, { post: Post }>();
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
  await new Promise((r) => setTimeout(r, 1000));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/posts"
  );
  return data;
}

async function fetchPostById(id: string) {
  await new Promise((r) => setTimeout(r, 1000));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return { ...data, body: data.body + " " + Math.random() };
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
