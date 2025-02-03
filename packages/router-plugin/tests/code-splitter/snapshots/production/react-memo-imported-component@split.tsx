import React from 'react';
import { importedLoader, importedComponent } from '../shared/imported';
const SplitComponent = React.memo(importedComponent);
export { SplitComponent as component };
const SplitLoader = importedLoader;
export { SplitLoader as loader };