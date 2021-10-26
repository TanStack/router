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
  useIsNextPath,
  useLoadRoute,
  useMatch,
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
  Params: { postId: string };
}>;

//

const location = new ReactLocation<LocationGenerics>();
const queryClient = new QueryClient();

function App() {
  return (
    <ReactLocationProvider location={location}>
      <QueryClientProvider client={queryClient}>
        <h1>Basic w/ React Query</h1>
        <hr />
        <Routes
          routes={[
            {
              path: ":postId",
              element: <Post />,
              loader: ({ params: { postId } }) =>
                queryClient.getQueryData(["posts", postId]) ??
                queryClient.fetchQuery(["posts", postId], () =>
                  fetchPostById(postId)
                ),
            },
            {
              path: "/",
              element: <Posts />,
              loader: () =>
                queryClient.getQueryData("posts") ??
                queryClient.fetchQuery("posts", fetchPosts).then(() => ({})),
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
  const isNextPath = useIsNextPath();
  const loadRoute = useLoadRoute();

  return (
    <div>
      <h2>Posts {isFetching ? "..." : ""}</h2>
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
                    onMouseEnter={() => loadRoute({ to: post.id })}
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
                    {post.title} {isNextPath(post.id) ? "..." : ""}
                  </Link>
                </p>
              ))}
            </div>
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
  } = useMatch();
  const isNextPath = useIsNextPath();

  const { status, data, error, isFetching } = usePost(postId);

  return (
    <div>
      <div>
        <Link to="..">Back {isNextPath("..") ? "..." : ""}</Link>
      </div>
      {!postId || status === "loading" ? (
        "Loading..."
      ) : status === "error" ? (
        <span>Error: {error.message}</span>
      ) : (
        <>
          <h1>
            {data?.title} {isFetching ? "..." : " "}
          </h1>
          <div>
            <p>{data?.body}</p>
          </div>
        </>
      )}
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
