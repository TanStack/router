console.warn("[tanstack-router] These exports from \"retain-exports-const.tsx\" will not be code-split and will increase your bundle size:\n- Layout\nFor the best optimization, these items should either have their export statements removed, or be imported from another location that is not a route file.");
import * as React from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { importedComponent as ImportedComponent, importedLoader } from '../../shared/imported';
export const loaderFn = () => {
  return importedLoader();
};
const Layout = () => {
  return <main>
      <header style={{
      height: HEADER_HEIGHT
    }}>
        <nav>
          <ul>
            <li>
              <a href="/">Home</a>
            </li>
          </ul>
        </nav>
      </header>
      <ImportedComponent />
      <Outlet />
    </main>;
};
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: loaderFn
});
const HEADER_HEIGHT = '63px';
export const SIDEBAR_WIDTH = '150px';
export const SIDEBAR_MINI_WIDTH = '80px';
const ASIDE_WIDTH = '250px';
export default Layout;