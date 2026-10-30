import { useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { SituationPage } from './pages/SituationPage';
import { TablesPage } from './pages/TablesPage';
import { BestResponsePage } from './pages/BestResponsePage';
import { HandEvPage } from './pages/HandEvPage';
import { WorstCasePage } from './pages/WorstCasePage';
import { EquilibriumPage } from './pages/EquilibriumPage';
import { TradeoffPage } from './pages/TradeoffPage';
import { WorksheetPage } from './pages/WorksheetPage';

export const ROUTES: { path: string; label: string; stage: string }[] = [
  { path: '/', label: 'ホーム', stage: '' },
  { path: '/situation', label: '局面計算', stage: '段階1・2' },
  { path: '/best-response', label: '最適応答', stage: '段階2〜4' },
  { path: '/hand-ev', label: '手札別の期待値', stage: '段階3' },
  { path: '/worst-case', label: '最悪ケース', stage: '段階4' },
  { path: '/equilibrium', label: '均衡を求める', stage: '段階4' },
  { path: '/tradeoff', label: '攻めと守り', stage: '段階5' },
  { path: '/tables', label: '表を作る', stage: '' },
  { path: '/worksheet', label: '問題用紙', stage: '印刷' },
];

function useHashRoute(): string {
  const read = () => {
    const h = window.location.hash.replace(/^#/, '');
    return h === '' ? '/' : h.split('?')[0];
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function App() {
  const route = useHashRoute();
  const [big, setBig] = useState(() => {
    try {
      return localStorage.getItem('seai-rg-camp.big') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('big', big);
    try {
      localStorage.setItem('seai-rg-camp.big', big ? '1' : '0');
    } catch {
      // ignore
    }
  }, [big]);

  let page;
  switch (route) {
    case '/situation':
      page = <SituationPage />;
      break;
    case '/best-response':
      page = <BestResponsePage />;
      break;
    case '/hand-ev':
      page = <HandEvPage />;
      break;
    case '/worst-case':
      page = <WorstCasePage />;
      break;
    case '/equilibrium':
      page = <EquilibriumPage />;
      break;
    case '/tradeoff':
      page = <TradeoffPage />;
      break;
    case '/tables':
      page = <TablesPage />;
      break;
    case '/worksheet':
      page = <WorksheetPage />;
      break;
    default:
      page = <HomePage />;
  }

  return (
    <div className="app">
      <nav className="topnav no-print">
        <a className="brand" href="#/">
          読み合いの果てに均衡がある
        </a>
        {ROUTES.filter((r) => r.path !== '/').map((r) => (
          <a key={r.path} href={`#${r.path}`} className={route === r.path ? 'active' : ''}>
            {r.label}
            {r.stage && <small>{r.stage}</small>}
          </a>
        ))}
        <button className="ghost" onClick={() => setBig((b) => !b)} title="投影用に文字を大きくする">
          {big ? '文字: 大' : '文字: 標準'}
        </button>
      </nav>
      <main>{page}</main>
    </div>
  );
}
