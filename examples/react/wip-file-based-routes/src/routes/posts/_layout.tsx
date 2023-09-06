import { Post } from "@/types";
import { fetchPosts } from "@/utils";
import { Link, Outlet } from "@tanstack/react-router";
import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/_layout').createRoute({
  loader: fetchPosts,
  component: () => {
    const posts = route.useLoader();

    const postsWithNonExistent = [
      ...posts,
      { id: "i-do-not-exist", title: "Non-existent Post" } as Post,
    ];

    const renderPostLink = (post: Post) => (
      <li key={post.id}>
        <Link to="/posts/$postId" params={{ postId: post.id }}>
          {post.title.substring(0, 20)}
        </Link>
      </li>
    );

    return (
      <div className="h-full p-2 flex gap-2">
        <ul className="list-none min-w-[12rem]">{postsWithNonExistent.map(renderPostLink)}</ul>
        {<Outlet />}
      </div>
    );
  },
});
