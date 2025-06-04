import { isEnabled } from '@features/feature-flags';
import TrueImport from '@modules/true-component';
import { FalseComponent, falseLoader } from '@modules/false-component';
import { Route } from "conditional-properties.tsx";
const SplitLoader = isEnabled ? TrueImport.loader : falseLoader;
export { SplitLoader as loader };
const SplitComponent = isEnabled ? TrueImport.Component : FalseComponent;
export { SplitComponent as component };