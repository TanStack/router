import { fetchPost } from "@/utils";
import { Link } from "@tanstack/react-router";
import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/$postId/deep').createRoute({
  loader: ({ params: { postId } }) => fetchPost(postId),
  errorComponent: () => <div>Something went wrong</div>,
  component: () => {
    const post = route.useLoader();
    const { postId } = route.useParams();

    return (
      <div className="flex flex-col gap-4">
        <Link to="/posts/$postId" params={{ postId }} className="block py-1 text-white">
          ← All Posts
        </Link>
        <div className="space-y-2">
          <h4 className="text-xl font-bold underline">{post.title}</h4>
          <div className="text-sm">{post.body}</div>
        </div>
      </div>
    );
  },
});
