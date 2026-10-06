import { store } from './store';
const unsubscribe = store.subscribe(() => {
  if (store.state.done) {
    unsubscribe();
  }
});
const SplitComponent = () => <div>{store.state.count}</div>;
export { SplitComponent as component };