import { Route } from "@tanstack/react-location";
import { LocationGenerics } from "..";

const route: Route<LocationGenerics> = {
  path: "really-expensive",
  // Routes can "import" all of their async elements and loaders in one handy
  // import call
  import: () => import("./ReallyExpensive").then((res) => res.loaders),
};

export default route;
