/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  ReactLocation,
  ReactLocationProvider,
  MakeGenerics,
  Router,
} from "react-location";
import { ReactLocationSimpleCache } from "react-location-simple-cache";

//

type Post = {
  id: string;
  title: string;
  body: string;
};

type LocationGenerics = MakeGenerics<{
  LoaderData: { posts: Post[]; post: Post };
}>;

//

const routeCache = new ReactLocationSimpleCache<LocationGenerics>();
const location = new ReactLocation<LocationGenerics>();

const router = new Router<LocationGenerics>({
  routes: [
    {
      element: <Posts />,
      loader: routeCache.createLoader(
        async () => ({
          posts: await fetchPosts(),
        }),
        { maxAge: 1000 * 20 }
      ),
      children: [
        { path: "/", element: "Select a post." },
        {
          path: "/:postId",
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
      ],
    },
  ],
});

function App() {
  return (
    <ReactLocationProvider location={location}>
      <router.Routes pendingElement="..." />
    </ReactLocationProvider>
  );
}

function Posts() {
  const {
    data: { posts },
    isLoading,
  } = router.useMatch();
  const isNextPath = router.useIsNextPath();
  const loadRoute = router.useLoadRoute();

  return (
    <div>
      <h1>Basic With Simple Cache</h1>
      <hr />
      <h1>
        <router.Link to=".">Posts {isLoading ? "..." : ""}</router.Link>
      </h1>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px" }}>
          {posts?.map((post) => (
            <p key={post.id}>
              <router.Link
                to={`./${post.id}`}
                onMouseEnter={() => loadRoute({ to: `./${post.id}` })}
              >
                {post.title} {isNextPath(post.id) ? "..." : ""}
              </router.Link>
            </p>
          ))}
        </div>
        <div style={{ flex: "1 1" }}>
          <router.Outlet />
        </div>
      </div>
    </div>
  );
}

function Post() {
  const {
    data: { post },
    isLoading,
  } = router.useMatch();

  return (
    <div>
      <h1>
        {post?.title} {isLoading ? "..." : ""}
      </h1>
      <div>
        <p>{post?.body}</p>
      </div>
    </div>
  );
}

async function fetchPosts() {
  await new Promise((r) => setTimeout(r, 300));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/posts"
  );
  return data;
}

async function fetchPostById(id: string) {
  await new Promise((r) => setTimeout(r, 300));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return { ...data, body: data.body + " " + Math.random() };
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
