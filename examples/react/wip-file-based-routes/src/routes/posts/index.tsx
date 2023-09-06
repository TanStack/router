import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts').createRoute({
  component: () => {
    return <div>Select a post</div>;
  },
});
