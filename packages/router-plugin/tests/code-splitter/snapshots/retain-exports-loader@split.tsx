console.warn("These exports from \"retain-exports-loader.tsx\" are not being code-split and will increase your bundle size: \n- loaderFn\nThese should either have their export statements removed or be imported from another file that is not a route.");
import { Outlet } from '@tanstack/react-router';
import { importedComponent as ImportedComponent } from '../shared/imported';
const HEADER_HEIGHT = '63px';
function Layout() {
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
export { Layout as component };