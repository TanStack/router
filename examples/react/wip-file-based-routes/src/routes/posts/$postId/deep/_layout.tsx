import { Outlet } from "@tanstack/react-router";
import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/posts/$postId/deep/_layout').createRoute({
  component: () => <Outlet />,
});
