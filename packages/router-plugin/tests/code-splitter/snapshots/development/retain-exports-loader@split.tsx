import { Outlet } from '@tanstack/react-router';
import { importedComponent as ImportedComponent } from '../shared/imported';
const HEADER_HEIGHT = '63px';
const component = function Layout() {
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
export { component };