const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
const {
  component: AboutComponent,
  loader
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
import { Route } from "destructured-export.tsx";
export { loader };
export { AboutComponent as component };