// Already exported variable - should not be double-exported
import { collection } from "./shared-already-exported.tsx";
const SplitLoader = async () => {
  await collection.preload();
  return {
    data: 'loaded'
  };
};
export { SplitLoader as loader };