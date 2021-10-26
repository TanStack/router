/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  MakeGenerics,
  ReactLocation,
  ReactLocationProvider,
  Router,
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

const router = new Router<LocationGenerics>({
  routes: [
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
  ],
});

function App() {
  return (
    <ReactLocationProvider location={location}>
      <router.Routes pendingElement="..." />
    </ReactLocationProvider>
  );
}

function Home() {
  return (
    <>
      <h1>Basic Example</h1>
      <hr />
      <router.Outlet />
    </>
  );
}

function Posts() {
  const {
    data: { posts },
  } = router.useRoute();
  const isNextPath = router.useIsNextPath();
  const loadRoute = router.useLoadRoute();

  return (
    <div>
      <h1>Posts</h1>
      <div>
        {posts?.map((post) => (
          <p key={post.id}>
            <router.Link to={post.id}>
              {post.title} {isNextPath(post.id) ? "..." : ""}
            </router.Link>
          </p>
        ))}
      </div>
    </div>
  );
}

function Post() {
  const {
    data: { post },
  } = router.useRoute<LocationGenerics>();
  const isNextPath = router.useIsNextPath();

  return (
    <div>
      <div>
        <router.Link to="..">Back {isNextPath("..") ? "..." : ""}</router.Link>
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
  await new Promise((r) => setTimeout(r, Math.random() * 500));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return data;
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
