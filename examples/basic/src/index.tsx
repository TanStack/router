/* eslint-disable @typescript-eslint/no-use-before-define */
import React from "react";
import ReactDOM from "react-dom";
import {
  Link,
  MakeGenerics,
  Outlet,
  ReactLocation,
  Router,
  useMatch,
} from "react-location";
import axios from "axios";

type PostType = {
  id: string;
  title: string;
  body: string;
};

type LocationGenerics = MakeGenerics<{
  LoaderData: {
    posts: PostType[];
    post: PostType;
  };
}>;

// Set up a ReactLocation instance
const location = new ReactLocation();

function App() {
  return (
    // Build our routes and render our router
    <Router
      location={location}
      routes={[
        { path: "/", element: <Index /> },
        {
          path: "posts",
          element: <Posts />,
          loader: async () => {
            return {
              posts: await fetchPosts(),
            };
          },
          children: [
            { path: "/", element: <PostsIndex /> },
            {
              path: ":postId",
              element: <Post />,
              loader: async ({ params: { postId } }) => {
                return {
                  post: await fetchPostById(postId),
                };
              },
            },
          ],
        },
      ]}
    >
      <div>
        <Link
          to="/"
          getActiveProps={getActiveProps}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>{" "}
        <Link to="posts" getActiveProps={getActiveProps}>
          Posts
        </Link>
      </div>
      <hr />
      <Outlet /> {/* Start rendering router matches */}
    </Router>
  );
}

async function fetchPosts() {
  await new Promise((r) => setTimeout(r, 300));
  return await axios
    .get("https://jsonplaceholder.typicode.com/posts")
    .then((r) => r.data.slice(0, 5));
}

async function fetchPostById(postId: string) {
  await new Promise((r) => setTimeout(r, 300));

  return await axios
    .get(`https://jsonplaceholder.typicode.com/posts/${postId}`)
    .then((r) => r.data);
}

function Index() {
  return (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  );
}

function Posts() {
  const {
    data: { posts },
  } = useMatch<LocationGenerics>();

  return (
    <div>
      <div>
        {posts?.map((post) => {
          return (
            <div key={post.id}>
              <Link to={post.id} getActiveProps={getActiveProps}>
                <pre>{post.title}</pre>
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
      <div>Select an post.</div>
    </>
  );
}

function Post() {
  const {
    data: { post },
  } = useMatch<LocationGenerics>();

  return (
    <div>
      <h4>{post?.title}</h4>
      <p>{post?.body}</p>
    </div>
  );
}

function getActiveProps() {
  return {
    style: {
      fontWeight: "bold",
    },
  };
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
