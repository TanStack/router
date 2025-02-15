import React from 'react';
import { importedLoader, importedComponent } from '../../shared/imported';
import { Route } from "react-memo-imported-component.tsx";
const SplitLoader = importedLoader;
export { SplitLoader as loader };
const SplitComponent = React.memo(importedComponent);
export { SplitComponent as component };