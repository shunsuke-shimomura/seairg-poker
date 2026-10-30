/**
 * 企画書（新案｜Leduc Hold'em ワークショップ）の第4〜7節の数値を再現できることを確かめる。
 */
import { describe, expect, it } from 'vitest';
import { baseTable } from './baseTable';
import { DEALS, allKeys, expectedValue, handValues } from './game';
import { bestResponse, counterChain, exploitability, worstCase } from './bestResponse';
import { analyzeSituation, fullValueViaNodes } from './situation';
import { runCfr } from './cfr';
import { roundToSixths } from './search';
import { toFraction, fmtFraction } from './fraction';
import presets from './presets.json';

const b0 = baseTable(0);
const b1 = baseTable(1);
const close = (x: number, y: number, tol = 0.006) => expect(Math.abs(x - y)).toBeLessThan(tol);

describe('ゲーム定義', () => {
  it('配り方は24種類で確率の和は1', () => {
    expect(DEALS.length).toBe(24); // 3枚とも同じランクはあり得ないので 27 − 3
    close(DEALS.reduce((a, d) => a + d.prob, 0), 1, 1e-12);
  });
  it('情報集合は60個', () => {
    expect(allKeys().length).toBe(60);
  });
  it('木の走査と汎用ノード評価が一致する', () => {
    close(expectedValue(b0, b1), fullValueViaNodes(b0, b1), 1e-12);
  });
  it('基本表どうしでは先手が −0.05', () => {
    close(expectedValue(b0, b1), -0.045);
  });
});

describe('段階1: 局面ごとの最善（後手でQ、基本表の先手）', () => {
  it('問1: ベットされたら J 1/7, Q 1/7, K 5/7', () => {
    const s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet'], r2: [] });
    const p = Object.fromEntries(s.posterior.map((r) => [r.hand, r.posterior]));
    close(p.J, 1 / 7, 1e-9);
    close(p.Q, 1 / 7, 1e-9);
    close(p.K, 5 / 7, 1e-9);
    expect(s.pot).toBe(4);
    expect(s.invested).toBe(1);
  });
  it('問1続き: チェックされていたら J 5/8, Q 1/4, K 1/8', () => {
    const s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['check'], r2: [] });
    const p = Object.fromEntries(s.posterior.map((r) => [r.hand, r.posterior]));
    close(p.J, 5 / 8, 1e-9);
    close(p.Q, 1 / 4, 1e-9);
    close(p.K, 1 / 8, 1e-9);
  });
  it('問2: 共有カードは J 13/28, Q 6/28, K 9/28', () => {
    const s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet'], r2: [] });
    const p = Object.fromEntries(s.boardDist!.map((r) => [r.board, r.prob]));
    close(p.J, 13 / 28, 1e-9);
    close(p.Q, 6 / 28, 1e-9);
    close(p.K, 9 / 28, 1e-9);
  });
  it('問3(a): 共有カードK、ベットされたらコールは −2.76 → フォールド', () => {
    const s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet', 'call'], board: 'K', r2: ['bet'] });
    const p = Object.fromEntries(s.posterior.map((r) => [r.hand, r.posterior]));
    close(p.J, 1 / 17, 1e-9);
    close(p.K, 15 / 17, 1e-9);
    expect(s.pot).toBe(10);
    const call = s.decision!.find((o) => o.action === 'call')!;
    close(call.ev, -47 / 17, 1e-9);
    expect(call.byHand.map((r) => r.value)).toEqual([10, 3, -4]);
    expect(s.decision!.find((o) => o.action === 'fold')!.ev).toBe(0);
  });
  it('問3(b): チェックされたらベット +5.5 > チェック +4.5', () => {
    const s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet', 'call'], board: 'K', r2: ['check'] });
    const p = Object.fromEntries(s.posterior.map((r) => [r.hand, r.posterior]));
    close(p.K, 0, 1e-12);
    const ev = Object.fromEntries(s.decision!.map((o) => [o.action, o.ev]));
    close(ev.bet, 5.5, 1e-9);
    close(ev.check, 4.5, 1e-9);
  });
});

describe('段階2: 後ろから解くと表全体が決まる', () => {
  it('問4: 第1ラウンドのコールは +0.74（J +0.62、K +2.08）', () => {
    const s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet'], r2: [] });
    const call = s.decision!.find((o) => o.action === 'call')!;
    close(call.ev, 0.738, 0.001);
    const byBoard = Object.fromEntries(call.byBoard!.map((r) => [r.board, r]));
    close(byBoard.J.value, -1.615, 0.001);
    close(byBoard.Q.value, 6.889, 0.001);
    close(byBoard.K.value, 1 / 27, 0.001);
    for (const h of ['J', 'K'] as const) {
      const t = analyzeSituation({ me: 1, myHand: h, opp: b0, r1: ['bet'], r2: [] });
      const c = t.decision!.find((o) => o.action === 'call')!.ev;
      close(c, h === 'J' ? 0.62 : 2.08, 0.005);
    }
  });
  it('基本表への最適応答は第1ラウンド常にベット・常にコール、+0.27 / +0.54', () => {
    const br0 = bestResponse(b1, 0);
    const br1 = bestResponse(b0, 1);
    close(br0.value, 0.273, 0.001);
    close(br1.value, 0.543, 0.001);
    for (const h of ['J', 'Q', 'K'] as const) {
      expect(br0.strategy[`r1|bet|${h}`]).toBe(1);
      expect(br0.strategy[`r1|call|${h}`]).toBe(1);
      expect(br1.strategy[`r1|bet|${h}`]).toBe(1);
      expect(br1.strategy[`r1|call|${h}`]).toBe(1);
    }
  });
});

describe('段階4: 再帰の先に均衡', () => {
  it('対策の連鎖: +0.27, +0.93, …（タイは1/2）', () => {
    const chain = counterChain(b1, 1, 4);
    close(chain[0].gain, 0.273, 0.001);
    close(chain[1].gain, 0.933, 0.001);
    expect(chain[2].gain).toBeGreaterThan(chain[1].gain);
  });
  it('最悪ケース: 基本表（先手）−0.54、基本表を突く表 −0.93', () => {
    close(worstCase(b0, 0), -0.543, 0.001);
    close(worstCase(bestResponse(b1, 0).strategy, 0), -0.933, 0.001);
    close(worstCase(b1, 1), -0.273, 0.001);
  });
  it('CFR は均衡値 −0.08 に近づく', () => {
    const snap = runCfr(2000);
    const [e0, e1] = snap.average;
    close(expectedValue(e0, e1), -0.08, 0.01);
    expect(exploitability(e0, e1)).toBeLessThan(0.05);
  });
  it('プリセットの均衡に近い表は、基本表より最悪ケースがずっと良い', () => {
    const near0 = presets.tables.find((t) => t.id === 'neareq-0')!.strategy as Record<string, number>;
    const near1 = presets.tables.find((t) => t.id === 'neareq-1')!.strategy as Record<string, number>;
    expect(worstCase(near0, 0)).toBeGreaterThan(-0.12);
    expect(worstCase(near1, 1)).toBeGreaterThan(-0.05);
    // 1/6 刻みになっている
    for (const v of Object.values(near0)) close(v, Math.round(v * 6) / 6, 1e-9);
    // 対基本表では勝つ
    expect(expectedValue(near0, b1)).toBeGreaterThan(0);
    expect(-expectedValue(b0, near1)).toBeGreaterThan(0);
  });
  it('手札別の期待値の加重平均は全体の期待値', () => {
    const near0 = presets.tables.find((t) => t.id === 'neareq-0')!.strategy as Record<string, number>;
    const br = bestResponse(near0, 1).strategy;
    const hv = handValues(near0, br, 0);
    close((hv.J + hv.Q + hv.K) / 3, expectedValue(near0, br), 1e-9);
  });
});

describe('表示', () => {
  it('分数近似', () => {
    expect(toFraction(13 / 28)).toEqual({ num: 13, den: 28 });
    expect(fmtFraction(5 / 7)).toBe('5/7');
    expect(fmtFraction(-47 / 17)).toBe('-47/17');
    expect(fmtFraction(2)).toBe('2');
  });
  it('丸め', () => {
    expect(roundToSixths({ a: 0.3, b: 0.9, c: 0.95 })).toEqual({ a: 2 / 6, b: 5 / 6, c: 1 });
  });
});
