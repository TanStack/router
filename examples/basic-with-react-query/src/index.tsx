/* eslint-disable jsx-a11y/anchor-is-valid */
import React from "react";
import ReactDOM from "react-dom";
import axios from "axios";
import {
  Link,
  MakeGenerics,
  ReactLocation,
  ReactLocationProvider,
  Routes,
  useRoute,
} from "react-location";
import {
  useQuery,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from "react-query";
import { ReactQueryDevtools } from "react-query/devtools";

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

const location = new ReactLocation();
const queryClient = new QueryClient();

function App() {
  return (
    <ReactLocationProvider location={location}>
      <QueryClientProvider client={queryClient}>
        <Routes
          pendingElement="..."
          routes={[
            {
              path: "/",
              element: <Posts />,
              loader: () =>
                queryClient.getQueryData("posts") ??
                queryClient.fetchQuery("posts", fetchPosts),
            },
            {
              path: ":postId",
              element: <Post />,
              loader: ({ params: { postId } }) =>
                queryClient.getQueryData(["posts", postId]) ??
                queryClient.fetchQuery(["posts", postId], () =>
                  fetchPostById(postId)
                ),
            },
          ]}
        />
        <ReactQueryDevtools initialIsOpen />
      </QueryClientProvider>
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

function usePosts() {
  return useQuery<Post[], any>("posts", fetchPosts);
}

function Posts() {
  const queryClient = useQueryClient();
  const { status, data, error, isFetching } = usePosts();

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
        {status === "loading" ? (
          "Loading..."
        ) : status === "error" ? (
          <span>Error: {error.message}</span>
        ) : (
          <>
            <div>
              {data?.map((post) => (
                <p key={post.id}>
                  <Link
                    to={`./${post.id}`}
                    style={
                      // We can access the query data here to show bold links for
                      // ones that are cached
                      queryClient.getQueryData(["post", post.id])
                        ? {
                            fontWeight: "bold",
                            color: "green",
                          }
                        : {}
                    }
                  >
                    {post.title}
                  </Link>
                </p>
              ))}
            </div>
            <div>{isFetching ? "Background Updating..." : " "}</div>
          </>
        )}
      </div>
    </div>
  );
}

const fetchPostById = async (id: string) => {
  await new Promise((r) => setTimeout(r, 500));
  const { data } = await axios.get(
    `https://jsonplaceholder.typicode.com/posts/${id}`
  );
  return data;
};

function usePost(postId: string) {
  return useQuery<Post, any>(["posts", postId], () => fetchPostById(postId), {
    enabled: !!postId,
  });
}

function Post() {
  const {
    params: { postId },
  } = useRoute();

  const { status, data, error, isFetching } = usePost(postId);

  return (
    <div>
      <div>
        <Link to="..">Back</Link>
      </div>
      {!postId || status === "loading" ? (
        "Loading..."
      ) : status === "error" ? (
        <span>Error: {error.message}</span>
      ) : (
        <>
          <h1>{data?.title}</h1>
          <div>
            <p>{data?.body}</p>
          </div>
          <div>{isFetching ? "Background Updating..." : " "}</div>
        </>
      )}
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
