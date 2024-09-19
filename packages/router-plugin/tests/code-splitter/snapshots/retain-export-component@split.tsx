console.warn("These exports from \"retain-export-component.tsx\" are not being code-split and will increase your bundle size: \n- Layout\nThese should either have their export statements removed or be imported from another file that is not a route.");
import { importedLoader } from '../shared/imported';
const SplitLoader = importedLoader;
export { SplitLoader as loader };