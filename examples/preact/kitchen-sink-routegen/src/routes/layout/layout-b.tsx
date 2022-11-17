import layoutRoute from "../layout";

export default layoutRoute.createRoute({
  path: "layout-b",
  component: LayoutB,
});

function LayoutB() {
  return (
    <div>
      <div>Layout B</div>
    </div>
  );
}
