const createBits = () => ({
  component: AboutComponentImpl,
  loader: () => ({
    message: 'hello'
  })
});
const {
  component: AboutComponent
} = createBits();
function AboutComponentImpl() {
  return <div>About</div>;
}
import { Route } from "destructured-export.tsx";
export { AboutComponent as component };