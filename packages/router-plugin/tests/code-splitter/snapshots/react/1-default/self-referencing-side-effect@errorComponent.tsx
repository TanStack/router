import { store } from './store';
const unsubscribe = store.subscribe(() => {
  if (store.state.done) {
    unsubscribe();
  }
});