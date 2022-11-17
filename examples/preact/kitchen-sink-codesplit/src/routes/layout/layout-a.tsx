import { layoutRoute } from ".";

export const layoutRouteA = layoutRoute.createRoute({
  path: "layout-a",
  component: LayoutA,
});

function LayoutA() {
  return (
    <div>
      <div>Layout A</div>
    </div>
  );
}
