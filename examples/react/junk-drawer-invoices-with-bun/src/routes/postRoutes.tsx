import { fetchPosts, fetchPost } from "../fetchers/posts";
import { NotFoundError } from "../types";
import { Link, Outlet, ErrorComponent } from "@tanstack/react-router";
import { Route } from "@tanstack/router-core";
import { rootRoute } from "./rootRoute";

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "posts",
  key: false,
  loader: fetchPosts,
  component: ({ useLoader }) => {
    const posts = useLoader();

    return (
      <div className="p-2 flex gap-2">
        <ul className="list-disc pl-4">
          {[
            ...posts,
            { id: "i-do-not-exist", title: "Non-existent Post" },
          ]?.map((post) => {
            return (
              <li key={post.id} className="whitespace-nowrap">
                <Link
                  to={postRoute.to}
                  params={{
                    postId: post.id,
                  }}
                  className="block py-1 text-blue-800 hover:text-blue-600"
                  activeProps={{ className: "text-black font-bold" }}
                >
                  <div>{post.title.substring(0, 20)}</div>
                </Link>
              </li>
            );
          })}
        </ul>
        <hr />
        <Outlet />
      </div>
    );
  },
});

export const postsIndexRoute = new Route({
  getParentRoute: () => postsRoute,
  path: "/",
  component: () => <div>Select a post.</div>,
});

export const postRoute = new Route({
  getParentRoute: () => postsRoute,
  path: "$postId",
  loader: async ({ params: { postId } }) => fetchPost(postId),
  errorComponent: ({ error }) => {
    if (error instanceof NotFoundError) {
      return <div>{error.message}</div>;
    }

    return <ErrorComponent error={error} />;
  },
  component: ({ useLoader }) => {
    const post = useLoader();

    return (
      <div className="space-y-2">
        <h4 className="text-xl font-bold underline">{post.title}</h4>
        <div className="text-sm">{post.body}</div>
      </div>
    );
  },
});
