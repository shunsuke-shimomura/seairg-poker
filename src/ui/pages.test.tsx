/**
 * 各ページがサーバーレンダリングで落ちずに主要な文言を出すことを確かめる煙テスト。
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StoreProvider } from './store';
import { HomePage } from './pages/HomePage';
import { SituationPage } from './pages/SituationPage';
import { TablesPage } from './pages/TablesPage';
import { BestResponsePage } from './pages/BestResponsePage';
import { HandEvPage } from './pages/HandEvPage';
import { WorstCasePage } from './pages/WorstCasePage';
import { EquilibriumPage } from './pages/EquilibriumPage';
import { WorksheetPage } from './pages/WorksheetPage';

const render = (el: React.ReactElement) => renderToString(<StoreProvider>{el}</StoreProvider>);

describe('ページの煙テスト', () => {
  it('ホーム', () => {
    expect(render(<HomePage />)).toContain('6段階');
  });
  it('局面計算（問1の初期状態）', () => {
    const html = render(<SituationPage />);
    expect(html).toContain('推定');
    expect(html).toContain('5/7');
    expect(html).toContain('13/28');
    expect(html).toContain('+0.74');
  });
  it('最適応答（基本表の後手を突く）', () => {
    const html = render(<BestResponsePage />);
    expect(html).toContain('+0.27');
    expect(html).toContain('対策の連鎖');
  });
  it('手札別の期待値', () => {
    const html = render(<HandEvPage />);
    expect(html).toContain('1マスを動かす');
    expect(html).toContain('表全体');
  });
  it('最悪ケース', () => {
    const html = render(<WorstCasePage />);
    expect(html).toContain('-0.54');
    expect(html).toContain('総当たり');
  });
  it('均衡を求める', () => {
    expect(render(<EquilibriumPage />)).toContain('CFR');
  });
  it('表を作る', () => {
    expect(render(<TablesPage />)).toContain('基本表（先手）');
  });
  it('問題用紙', () => {
    const html = render(<WorksheetPage />);
    expect(html).toContain('問1');
    expect(html).toContain('問4');
    expect(html).not.toContain('5/7'); // 答えは載せない
  });
});
