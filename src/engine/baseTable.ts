/**
 * 基本表（主催者が設計した相手の表）。先手・後手どちらの立場でも同じ数字。
 * 第2ラウンドは第1ラウンドの経緯によらない。
 */
import { HISTS, RANKS, type Position, type Rank, type Strategy, r1Key, r2Key } from './game';

const R1_BET: Record<Rank, number> = { J: 1 / 6, Q: 2 / 6, K: 5 / 6 };
const R1_CALL: Record<Rank, number> = { J: 1 / 6, Q: 4 / 6, K: 6 / 6 };
/** [自分からベット, ベットされたらコール] */
const R2: Record<'pair' | Rank, [number, number]> = {
  pair: [6 / 6, 6 / 6],
  K: [3 / 6, 4 / 6],
  Q: [1 / 6, 2 / 6],
  J: [1 / 6, 0 / 6],
};

export function baseTable(_position: Position): Strategy {
  const s: Strategy = {};
  for (const h of RANKS) {
    s[r1Key('bet', h)] = R1_BET[h];
    s[r1Key('call', h)] = R1_CALL[h];
    for (const b of RANKS) {
      const cat = h === b ? 'pair' : h;
      for (const hist of HISTS) {
        s[r2Key('bet', h, b, hist)] = R2[cat][0];
        s[r2Key('call', h, b, hist)] = R2[cat][1];
      }
    }
  }
  return s;
}
