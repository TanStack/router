const $$splitLoaderImporter = () => import('retain-export-component.tsx?tsr-split');
import { lazyFn } from '@tanstack/react-router';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { importedComponent as ImportedComponent } from '../shared/imported';
export function Layout() {
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
}
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: lazyFn($$splitLoaderImporter, 'loader')
});
const HEADER_HEIGHT = '63px';
export const SIDEBAR_WIDTH = '150px';