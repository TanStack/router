console.warn("These exports from \"export-default-component-and-normal-notFound.tsx?component---errorComponent---notFoundComponent---pendingComponent\" are not being code-split and will increase your bundle size: \n- Home\nThese should either have their export statements removed or be imported from another file that is not a route.");
import React from 'react';
import { Route } from "export-default-component-and-normal-notFound.tsx";
const SplitNotFoundComponent = function NotFoundComponent() {
  return <div>Not Found</div>;
};
export { SplitNotFoundComponent as notFoundComponent };