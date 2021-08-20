import 'react-app-polyfill/ie11';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {
  ReactLocation,
  Routes,
  Route,
  Link,
  useParams,
  Navigate,
  useSearch,
} from '../.';

const App = () => {
  return (
    <ReactLocation>
      <Root />
    </ReactLocation>
  );
};

function Root() {
  return (
    <>
      <div>
        <Link to="/">
          <pre>Home</pre>
        </Link>
        <Link to="." search={(old) => ({ ...old, foo: 'bar' })}>
          <pre>Test</pre>
        </Link>
        <Link
          to="."
          search={{
            someParams: '',
            otherParams: 'gogogo',
            object: { nested: { list: [1, 2, 3], hello: 'world' } },
          }}
        >
          <pre>Test</pre>
        </Link>
        {/* <div>
          <Link to="/">
            <pre>/</pre>
          </Link>
        </div>
        <div>
          <Link to="/teams">
            <pre>/teams</pre>
          </Link>
        </div>
        <div>
          <Link to="./teams">
            <pre>./teams</pre>
          </Link>
        </div> */}
      </div>
      {/*<Routes>
        <Route path="/" element={'Hello'} />
        <Route path="/something/very/specific" element="Hello" />
        <Route path="/something/:param/specific" element="Hello" />
        <Route path=":param" element="Teams" />
        <Route path="/:param" element="Teams" />
        <Route path=":param/specific" element="Teams" />
        <Route path={undefined!} element="Nothing" />
        <Route
          path="teams"
          element={
            <div>
              <div>
                <Link to="..">
                  <pre>..</pre>
                </Link>
              </div>
              <div>
                <Link to="new">
                  <pre>new</pre>
                </Link>
              </div>
              <div>
                <Link to="team-1">
                  <pre>team-1</pre>
                </Link>
              </div>
              <div>
                <Link to="./team-2">
                  <pre>./team-2</pre>
                </Link>
              </div>
              <Routes>
                <Route path="new" element="New" />
                <Route path=":teamId" element={<Team />} />
                <Route path="*" element={<Navigate to="new" />} />
              </Routes>
            </div>
          }
        />
      </Routes> */}
    </>
  );
}

function Team() {
  const params = useParams();

  return <div>TeamId: {params.teamId}</div>;
}

ReactDOM.render(<App />, document.getElementById('root'));
