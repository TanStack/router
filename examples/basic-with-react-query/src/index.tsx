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
const router = new Router<LocationGenerics>({
  routes: [
    {
      path: ":postId",
      element: <Post />,
      loader: ({ params: { postId } }) =>
        queryClient.getQueryData(["posts", postId]) ??
        queryClient.fetchQuery(["posts", postId], () => fetchPostById(postId)),
    },
    {
      path: "/",
      element: <Posts />,
      loader: () =>
        queryClient.getQueryData("posts") ??
        queryClient.fetchQuery("posts", fetchPosts).then(() => ({})),
    },
  ],
});
const queryClient = new QueryClient();

function App() {
  return (
    <ReactLocationProvider location={location}>
      <QueryClientProvider client={queryClient}>
        <router.Routes pendingElement="..." />
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
  const isNextPath = router.useIsNextPath();
  const loadRoute = router.useLoadRoute();

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
      <h1>Posts {isFetching ? "..." : ""}</h1>
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
                  <router.Link
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
                  </router.Link>
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
  } = router.useRoute();
  const isNextPath = router.useIsNextPath();

  const { status, data, error, isFetching } = usePost(postId);

  return (
    <div>
      <div>
        <router.Link to="..">Back {isNextPath("..") ? "..." : ""}</router.Link>
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
