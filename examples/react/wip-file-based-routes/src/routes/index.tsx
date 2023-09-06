import { FileRoute } from "@tanstack/router-core";

export const route = new FileRoute('/').createRoute({
  component: () => (
    <div className="p-2">
      <h3 className="text-xl font-bold">Welcome Home!</h3>
    </div>
  ),
});
