import React from 'react';
import { importedLoader, importedComponent } from '../shared/imported';
const component = React.memo(importedComponent);
export { component };
const loader = importedLoader;
export { loader };