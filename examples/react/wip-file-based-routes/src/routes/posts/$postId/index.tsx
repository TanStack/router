import { fetchPost } from "@/utils";
import { Link } from "@tanstack/react-router";
import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/$postId').createRoute({
  loader: ({ params: { postId } }) => fetchPost(postId),
  errorComponent: () => <div>Something went wrong</div>,
  component: () => {
    const post = route.useLoader();

    return (
      <div className="flex flex-col gap-4">
        <div className="space-y-2">
          <h4 className="text-xl font-bold underline">{post.title}</h4>
          <div className="text-sm">{post.body}</div>
        </div>
        <Link
          to="/posts/$postId/deep"
          params={{
            postId: post.id,
          }}
          className="py-1 px-2 rounded bg-indigo-400 self-start hover:bg-indigo-700"
        >
          Deep View
        </Link>
      </div>
    );
  },
});
