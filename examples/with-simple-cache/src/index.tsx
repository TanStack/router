/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  ReactLocation,
  Router,
  MakeGenerics,
  useMatch,
  useLoadRoute,
  Link,
  Outlet,
  MatchRoute,
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

function App() {
  return (
    <Router
      location={location}
      routes={[
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
          ],
        },
      ]}
    />
  );
}

function Posts() {
  const {
    data: { posts },
    isLoading,
  } = useMatch<LocationGenerics>();
  const loadRoute = useLoadRoute<LocationGenerics>();

  return (
    <div>
      <h1>Basic With Simple Cache</h1>
      <hr />
      <h2>
        <Link to=".">Posts {isLoading ? "..." : ""}</Link>
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px" }}>
          {posts?.map((post) => (
            <p key={post.id}>
              <Link
                to={post.id}
                onMouseEnter={() => loadRoute({ to: `./${post.id}` })}
              >
                {post.title}{" "}
                <MatchRoute to={post.id} pending>
                  ...
                </MatchRoute>
              </Link>
            </p>
          ))}
        </div>
        <div style={{ flex: "1 1" }}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function Post() {
  const {
    data: { post },
    isLoading,
  } = useMatch<LocationGenerics>();

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
