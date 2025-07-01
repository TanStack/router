import { isEnabled } from '@features/feature-flags';
import TrueImport from '@modules/true-component';
import { FalseComponent } from '@modules/false-component';
import { Route } from "conditional-properties.tsx";
const SplitComponent = isEnabled ? TrueImport.Component : FalseComponent;
export { SplitComponent as component };