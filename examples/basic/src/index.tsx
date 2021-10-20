/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  Link,
  ReactLocation,
  ReactLocationProvider,
  Routes,
  useResolvePath,
  useRoute,
  useRouterState,
} from "react-location";

//

type Post = {
  id: string;
  title: string;
  body: string;
};

//

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
            loader: async () => ({
              posts: await fetchPosts(),
            }),
          },
          {
            path: ":postId",
            element: <Post />,
            loader: async ({ params: { postId } }) => ({
              post: await fetchPostById(postId),
            }),
          },
        ]}
      />
    </ReactLocationProvider>
  );
}

function Posts() {
  const {
    data: { posts },
  } = useRoute<{ posts: Post[] }>();
  const routerState = useRouterState();
  const resolvePath = useResolvePath();

  return (
    <div>
      <h1>Posts</h1>
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
  } = useRoute<{ post: Post }>();
  const routerState = useRouterState();
  const resolvePath = useResolvePath();

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
      <h1>{post.title}</h1>
      <div>
        <p>{post.body}</p>
      </div>
    </div>
  );
}

async function fetchPosts() {
  await new Promise((r) => setTimeout(r, 500));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/posts"
  );
  return data;
}

async function fetchPostById(id: string) {
  await new Promise((r) => setTimeout(r, 500));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return data;
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
