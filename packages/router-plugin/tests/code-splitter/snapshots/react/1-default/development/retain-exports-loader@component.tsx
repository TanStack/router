import * as React from 'react';
import { Outlet } from '@tanstack/react-router';
import { importedComponent as ImportedComponent } from '../../shared/imported';
import { Route } from "retain-exports-loader.tsx";
const HEADER_HEIGHT = '63px';
import { SIDEBAR_WIDTH } from "retain-exports-loader.tsx";
import { SIDEBAR_MINI_WIDTH } from "retain-exports-loader.tsx";
const ASIDE_WIDTH = '250px';
const SplitComponent = function Layout() {
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
export { SplitComponent as component };