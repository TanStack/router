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

async function fetchPosts() {
  await new Promise((r) => setTimeout(r, 500));
  const { data } = await axios.get(
    "https://jsonplaceholder.typicode.com/posts"
  );
  return data;
}

function Posts() {
  const {
    data: { posts },
  } = useRoute<{ posts: Post[] }>();

  return (
    <div>
      <p>
        As you visit the posts below, you will notice them in a loading state
        the first time you load them. However, after you return to this list and
        click on any posts you have already visited again, you will see them
        load instantly and background refresh right before your eyes!{" "}
        <strong>
          (You may need to throttle your network speed to simulate longer
          loading sequences)
        </strong>
      </p>
      <h1>Posts</h1>
      <div>
        {posts.map((post) => (
          <p key={post.id}>
            <Link to={`./${post.id}`}>{post.title}</Link>
          </p>
        ))}
      </div>
    </div>
  );
}

async function fetchPostById(id: string) {
  await new Promise((r) => setTimeout(r, 500));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return data;
}

function Post() {
  const {
    data: { post },
  } = useRoute<{ post: Post }>();

  return (
    <div>
      <div>
        <Link to="..">Back</Link>
      </div>
      <h1>{post.title}</h1>
      <div>
        <p>{post.body}</p>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
