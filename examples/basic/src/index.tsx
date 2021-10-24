/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  Link,
  MakeGenerics,
  Outlet,
  ReactLocation,
  ReactLocationProvider,
  Routes,
  useRoute,
  useIsNextPath,
} from "react-location";

//

type Post = {
  id: string;
  title: string;
  body: string;
};

//

type LocationGenerics = MakeGenerics<{
  LoaderData: { posts: Post[]; post: Post };
}>;

//

const location = new ReactLocation();

function App() {
  return (
    <ReactLocationProvider location={location}>
      <Routes
        pendingElement="..."
        routes={[
          {
            element: <Home />,
            children: [
              {
                path: ":postId",
                element: <Post />,
                loader: async ({ params: { postId } }) => ({
                  post: await fetchPostById(postId),
                }),
              },
              {
                element: <Posts />,
                loader: async () => ({
                  posts: await fetchPosts(),
                }),
              },
            ],
          },
        ]}
      />
    </ReactLocationProvider>
  );
}

function Home() {
  return (
    <>
      <h1>Basic Example</h1>
      <hr />
      <Outlet />
    </>
  );
}

function Posts() {
  const {
    data: { posts },
  } = useRoute<LocationGenerics>();
  const isNextPath = useIsNextPath();

  return (
    <div>
      <h1>Posts</h1>
      <div>
        {posts?.map((post) => (
          <p key={post.id}>
            <Link to={`./${post.id}`}>
              {post.title} {isNextPath(post.id) ? "..." : ""}
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
  } = useRoute<LocationGenerics>();
  const isNextPath = useIsNextPath();

  return (
    <div>
      <div>
        <Link to="..">Back {isNextPath("..") ? "..." : ""}</Link>
      </div>
      <h1>{post?.title}</h1>
      <div>
        <p>{post?.body}</p>
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
