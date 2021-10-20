import * as React from 'react';
import * as rtl from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import {
  ReactLocation,
  Routes,
  Route,
  Link,
  useParams,
  Navigate,
  createMemoryHistory,
  useNavigate,
} from '../src';

describe('it', () => {
  afterEach(() => {
    history.pushState(null, '', '/');
  });

  it('can link to and render routes', async () => {
    const memoryHistory = createMemoryHistory();

    rtl.render(
      <ReactLocation history={memoryHistory}>
        <Routes>
          <Route path="/" element={<Link to="./a">Link A</Link>} />
          <Route
            path="a"
            element={
              <div>
                <Routes>
                  <Route path="/" element={<Link to="./b">Link B</Link>} />
                  <Route
                    path="b"
                    element={
                      <div>
                        <Routes>
                          <Route
                            path="/"
                            element={<Link to="./c">Link C</Link>}
                          />
                          <Route path="c" element="Route C" />
                        </Routes>
                      </div>
                    }
                  />
                </Routes>
              </div>
            }
          />
        </Routes>
      </ReactLocation>
    );

    rtl.fireEvent.click(rtl.screen.getByText('Link A'));
    rtl.fireEvent.click(rtl.screen.getByText('Link B'));
    rtl.fireEvent.click(rtl.screen.getByText('Link C'));
    rtl.screen.getByText('Route C');
  });

  it('can link from deep routes to the root', async () => {
    const memoryHistory = createMemoryHistory();

    rtl.render(
      <ReactLocation history={memoryHistory}>
        <Routes>
          <Route path="/" element={<Link to="./a/b/c">To C</Link>} />
          <Route
            path="a"
            element={
              <div>
                <Routes>
                  <Route
                    path="b"
                    element={
                      <div>
                        <Routes>
                          <Route
                            path="c"
                            element={<Link to="/">To Root</Link>}
                          />
                        </Routes>
                      </div>
                    }
                  />
                </Routes>
              </div>
            }
          />
        </Routes>
      </ReactLocation>
    );

    rtl.fireEvent.click(rtl.screen.getByText('To C'));
    rtl.fireEvent.click(rtl.screen.getByText('To Root'));
    rtl.screen.getByText('To C');
  });

  it('can link to and render param routes', async () => {
    const memoryHistory = createMemoryHistory();

    rtl.render(
      <ReactLocation history={memoryHistory}>
        <Routes>
          <Route path="/" element={<Link to="1234">Link A</Link>} />
          <Route path=":teamId" element={<Team />} />
        </Routes>
      </ReactLocation>
    );

    function Team() {
      const params = useParams();

      return <div>teamId: {params.teamId}</div>;
    }

    rtl.fireEvent.click(rtl.screen.getByText('Link A'));
    rtl.screen.getByText('teamId: 1234');
  });

  it('can navigate with Navigate', async () => {
    const memoryHistory = createMemoryHistory();

    rtl.render(
      <ReactLocation history={memoryHistory}>
        <Routes>
          <Route path="/" element={<Navigate to="a" />} />
          <Route path="a" element={'Route A'} />
        </Routes>
      </ReactLocation>
    );

    rtl.screen.getByText('Route A');
  });

  it('can navigate with useNavigate()', async () => {
    const memoryHistory = createMemoryHistory();

    rtl.render(
      <ReactLocation history={memoryHistory}>
        <Routes>
          <Route path="/" element={<Custom />} />
          <Route path="a" element={'Route A'} />
        </Routes>
      </ReactLocation>
    );

    function Custom() {
      const navigate = useNavigate();

      return <button onClick={() => navigate('a')}>navigate</button>;
    }

    rtl.fireEvent.click(rtl.screen.getByText('navigate'));
    rtl.screen.getByText('Route A');
  });
});
