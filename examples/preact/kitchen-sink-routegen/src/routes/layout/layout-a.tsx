import layoutRoute from "../layout";

export default layoutRoute.createRoute({
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
