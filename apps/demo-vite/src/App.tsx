import { useEffect, useState } from 'react';
import { Home } from './routes/Home';
import { Pricing } from './routes/Pricing';

type Route = '/' | '/pricing';

/** A tiny hash router so the demo has multiple routes to capture across. */
export function App() {
  const [route, setRoute] = useState<Route>(currentRoute());

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <strong>⚒️ ClickSmith Demo</strong>
        <nav>
          <a href="#/" className={route === '/' ? 'active' : ''}>
            Home
          </a>
          <a href="#/pricing" className={route === '/pricing' ? 'active' : ''}>
            Pricing
          </a>
        </nav>
      </header>
      <main>{route === '/pricing' ? <Pricing /> : <Home />}</main>
      <footer className="hint">
        Run the daemon, enable AI Mode in the extension, then <kbd>Alt</kbd>+Click the buttons.
      </footer>
    </div>
  );
}

function currentRoute(): Route {
  return window.location.hash === '#/pricing' ? '/pricing' : '/';
}
