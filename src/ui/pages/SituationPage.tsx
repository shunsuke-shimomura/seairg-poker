import { useMemo, useState } from 'react';
import { RANKS, type Position, type Rank } from '../../engine/game';
import {
  analyzeSituation,
  endedByFold,
  isRoundOver,
  optionsFor,
  r1OutcomeOf,
  turnOf,
  type Action,
} from '../../engine/situation';
import { fmtFraction, fmtBoth } from '../../engine/fraction';
import { BASE_ID, positionLabel, useStore } from '../store';
import { Ev, PositionButtons, RankButtons, TableSelect } from '../components/common';
import { StrategyTable } from '../components/StrategyTable';

const ACTION_LABEL: Record<Action, string> = { bet: 'ベット', check: 'チェック', call: 'コール', fold: 'フォールド' };

interface Scenario {
  label: string;
  me: Position;
  myHand: Rank;
  r1: Action[];
  board?: Rank;
  r2: Action[];
}

const SCENARIOS: Scenario[] = [
  { label: '問1：後手でQ、先手がベット', me: 1, myHand: 'Q', r1: ['bet'], r2: [] },
  { label: '問1続き：先手がチェック', me: 1, myHand: 'Q', r1: ['check'], r2: [] },
  { label: '問3(a)：共有カードK、先手がベット', me: 1, myHand: 'Q', r1: ['bet', 'call'], board: 'K', r2: ['bet'] },
  { label: '問3(b)：共有カードK、先手がチェック', me: 1, myHand: 'Q', r1: ['bet', 'call'], board: 'K', r2: ['check'] },
  { label: '問4：第1ラウンドでコールすべきか', me: 1, myHand: 'Q', r1: ['bet'], r2: [] },
];

function SeqBuilder({
  seq,
  me,
  onChange,
  title,
}: {
  seq: Action[];
  me: Position;
  onChange: (s: Action[]) => void;
  title: string;
}) {
  const turn = turnOf(seq);
  const actorOf = (i: number) => turnOf(seq.slice(0, i))!;
  return (
    <div className="field">
      <span>{title}</span>
      <div className="seq">
        {seq.length === 0 && <span className="muted">（まだ誰も行動していない）</span>}
        {seq.map((a, i) => {
          const p = actorOf(i);
          return (
            <span key={i} className={`chip ${p === me ? 'me' : 'opp'}`}>
              {positionLabel(p)}
              {p === me ? '（自分）' : '（相手）'}：{ACTION_LABEL[a]}
            </span>
          );
        })}
        {turn !== null && (
          <>
            <span className="muted">→ {positionLabel(turn)}{turn === me ? '（自分）' : '（相手）'}の番：</span>
            {optionsFor(seq).map((a) => (
              <button key={a} onClick={() => onChange([...seq, a])}>
                {ACTION_LABEL[a]}
              </button>
            ))}
          </>
        )}
        {seq.length > 0 && (
          <button className="ghost" onClick={() => onChange(seq.slice(0, -1))}>
            ひとつ戻す
          </button>
        )}
      </div>
    </div>
  );
}

export function SituationPage() {
  const store = useStore();
  const [me, setMe] = useState<Position>(1);
  const [myHand, setMyHand] = useState<Rank>('Q');
  const [oppId, setOppId] = useState<string>(BASE_ID[0]);
  const [r1, setR1] = useState<Action[]>(['bet']);
  const [board, setBoard] = useState<Rank | undefined>(undefined);
  const [r2, setR2] = useState<Action[]>([]);
  const [showFuture, setShowFuture] = useState(false);

  const oppPos = (1 - me) as Position;
  const opp = store.byId(oppId) ?? store.byPosition(oppPos)[0];

  const changeMe = (p: Position) => {
    setMe(p);
    setOppId(BASE_ID[(1 - p) as Position]);
  };
  const changeR1 = (s: Action[]) => {
    setR1(s);
    setBoard(undefined);
    setR2([]);
  };
  const applyScenario = (sc: Scenario) => {
    setMe(sc.me);
    setOppId(BASE_ID[(1 - sc.me) as Position]);
    setMyHand(sc.myHand);
    setR1(sc.r1);
    setBoard(sc.board);
    setR2(sc.r2);
  };

  const r1Over = isRoundOver(r1);
  const r1Fold = endedByFold(r1);
  const r1Outcome = r1Over ? r1OutcomeOf(r1) : null;

  const sit = useMemo(
    () => (opp ? analyzeSituation({ me, myHand, opp: opp.strategy, r1, board, r2 }) : null),
    [opp, me, myHand, r1, board, r2],
  );

  if (!opp || !sit) return <p>相手の表がありません。</p>;

  const factorLabels = sit.posterior[0]?.factors.map((f) => f.label) ?? [];
  const minW = Math.min(...sit.posterior.map((r) => r.weight).filter((w) => w > 0));
  const bestEv = sit.decision ? Math.max(...sit.decision.map((o) => o.ev)) : 0;

  // 相手の番なら、相手の次の行動の確率
  let oppNext: { aggressive: Action; rows: { hand: Rank; posterior: number; p: number }[]; total: number } | null = null;
  if (sit.whoseTurn === oppPos) {
    const [aggressive] = optionsFor(sit.state.seq);
    const rows = RANKS.map((h) => {
      const kind = aggressive === 'bet' ? 'bet' : 'call';
      const key =
        sit.state.round === 1
          ? `r1|${kind}|${h}`
          : `r2|${kind}|${h}|${board}|${sit.state.r1 === 'cc' ? 'check' : (sit.state.r1 === 'bc') === (oppPos === 0) ? 'mebet' : 'oppbet'}`;
      const posterior = sit.posterior.find((r) => r.hand === h)!.posterior;
      return { hand: h, posterior, p: opp.strategy[key] ?? 0 };
    });
    oppNext = { aggressive, rows, total: rows.reduce((a, r) => a + r.posterior * r.p, 0) };
  }

  return (
    <div>
      <h1>局面計算</h1>
      <p className="lead">相手の行動から手札を推定し、未来のカードの確率を出し、一つの判断の期待値を比べる。段階1・2で使う。</p>

      <div className="row no-print">
        <span className="muted">場面を呼び出す：</span>
        {SCENARIOS.map((sc) => (
          <button key={sc.label} onClick={() => applyScenario(sc)}>
            {sc.label}
          </button>
        ))}
      </div>

      <div className="controls">
        <PositionButtons label="自分の立場" value={me} onChange={changeMe} />
        <RankButtons label="自分の手札" value={myHand} onChange={setMyHand} />
        <TableSelect label={`相手（${positionLabel(oppPos)}）の表`} position={oppPos} value={opp.id} onChange={setOppId} />
      </div>

      <div className="controls">
        <SeqBuilder title="第1ラウンドの経緯" seq={r1} me={me} onChange={changeR1} />
        {r1Over && r1Fold !== null && (
          <span>
            {positionLabel(r1Fold)}がフォールドして終了。
          </span>
        )}
        {r1Over && r1Outcome && (
          <div className="field">
            <span>共有カード</span>
            <div className="btn-group">
              <button className={board === undefined ? 'active' : ''} onClick={() => { setBoard(undefined); setR2([]); }}>
                未定
              </button>
              {RANKS.map((b) => (
                <button key={b} className={board === b ? 'active' : ''} onClick={() => { setBoard(b); setR2([]); }}>
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}
        {r1Over && r1Outcome && board && <SeqBuilder title="第2ラウンドの経緯" seq={r2} me={me} onChange={setR2} />}
      </div>

      <div className="row">
        <span>
          ポット <b>{sit.pot}</b>（自分がこれまでに入れたチップ {sit.invested}）
        </span>
        <span className="muted">
          {sit.state.round === 1 ? '第1ラウンド' : '第2ラウンド'}
          {sit.isTerminal
            ? '・ハンド終了'
            : sit.whoseTurn === null
              ? '・ラウンド終了'
              : `・${positionLabel(sit.whoseTurn)}${sit.whoseTurn === me ? '（自分）' : '（相手）'}の番`}
        </span>
      </div>

      <h2>推定：相手の手札はどれか</h2>
      <p className="muted">事前確率 × （相手の行動をとる確率）×（共有カードが出る確率）… の比が、事後確率の比。</p>
      <table className="data">
        <thead>
          <tr>
            <th>相手の手札</th>
            <th>事前確率</th>
            {factorLabels.map((l) => (
              <th key={l}>{l}</th>
            ))}
            <th>重み</th>
            <th>重みの比</th>
            <th>事後確率</th>
          </tr>
        </thead>
        <tbody>
          {sit.posterior.map((r) => (
            <tr key={r.hand} className={r.posterior === 0 ? 'muted' : ''}>
              <td>{r.hand}</td>
              <td>{fmtFraction(r.prior)}</td>
              {r.factors.map((f, i) => (
                <td key={i}>{fmtFraction(f.value)}</td>
              ))}
              <td>{fmtFraction(r.weight)}</td>
              <td>{r.weight > 0 ? fmtFraction(r.weight / minW) : '0'}</td>
              <td>
                <b>{fmtBoth(r.posterior)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {oppNext && (
        <>
          <h3>相手の次の行動</h3>
          <table className="data">
            <thead>
              <tr>
                <th>相手の手札</th>
                <th>事後確率</th>
                <th>{ACTION_LABEL[oppNext.aggressive]}する確率（相手の表）</th>
                <th>積</th>
              </tr>
            </thead>
            <tbody>
              {oppNext.rows.map((r) => (
                <tr key={r.hand}>
                  <td>{r.hand}</td>
                  <td>{fmtFraction(r.posterior)}</td>
                  <td>{fmtFraction(r.p)}</td>
                  <td>{fmtFraction(r.posterior * r.p)}</td>
                </tr>
              ))}
              <tr className="best">
                <td colSpan={3}>相手が{ACTION_LABEL[oppNext.aggressive]}してくる確率</td>
                <td>{fmtBoth(oppNext.total)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {sit.boardDist && (
        <>
          <h2>共有カードの確率</h2>
          <p className="muted">相手の手札ごとに残り4枚の内訳が変わる（カード除去）。事後確率で平均する。</p>
          <table className="data">
            <thead>
              <tr>
                <th>共有カード</th>
                {RANKS.map((h) => (
                  <th key={h}>
                    相手が{h}のとき
                    <br />
                    <small className="muted">（事後 {fmtFraction(sit.posterior.find((r) => r.hand === h)!.posterior)}）</small>
                  </th>
                ))}
                <th>確率</th>
              </tr>
            </thead>
            <tbody>
              {sit.boardDist.map((r) => (
                <tr key={r.board}>
                  <td>{r.board}</td>
                  {RANKS.map((h) => (
                    <td key={h}>{fmtFraction(r.perHand[h])}</td>
                  ))}
                  <td>
                    <b>{fmtBoth(r.prob)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {sit.decision && (
        <>
          <h2>判断：この時点からの増減</h2>
          <p className="muted">
            フォールドは 0。ポットを取れば、過去に自分が入れた分も含めてポット全額が増減。
            自分の今後の打ち方は、相手の表に対する最適応答。{' '}
            <button className="ghost" onClick={() => setShowFuture((v) => !v)}>
              {showFuture ? '今後の打ち方を隠す' : '今後の打ち方（最適応答の表）を見る'}
            </button>
          </p>
          <div className="grid2">
            {sit.decision.map((o) => (
              <div className="panel" key={o.action}>
                <h3>
                  {ACTION_LABEL[o.action]}：<Ev value={o.ev} />
                  {Math.abs(o.ev - bestEv) < 1e-9 && sit.decision!.length > 1 && <span className="chip me" style={{ marginLeft: 8 }}>こちらが得</span>}
                </h3>
                <table className="data">
                  <thead>
                    <tr>
                      <th>相手の手札</th>
                      <th>事後確率</th>
                      <th>増減</th>
                      <th>備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.byHand.map((r) => (
                      <tr key={r.hand} className={r.posterior === 0 ? 'muted' : ''}>
                        <td>{r.hand}</td>
                        <td>{fmtFraction(r.posterior)}</td>
                        <td>
                          <Ev value={r.value} />
                        </td>
                        <td style={{ textAlign: 'left' }}>{r.note}</td>
                      </tr>
                    ))}
                    <tr className="best">
                      <td colSpan={2}>期待値</td>
                      <td>
                        <Ev value={o.ev} />
                      </td>
                      <td style={{ textAlign: 'left' }}>{fmtFraction(o.ev)}</td>
                    </tr>
                  </tbody>
                </table>
                {o.byBoard && o.action !== 'fold' && o.action !== 'check' && (
                  <>
                    <h4>共有カード別の内訳（その後を最善に打ったとき）</h4>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>共有カード</th>
                          <th>確率</th>
                          <th>期待値</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.byBoard.map((r) => (
                          <tr key={r.board}>
                            <td>{r.board}{r.board === myHand ? '（自分がペア）' : ''}</td>
                            <td>{fmtFraction(r.prob)}</td>
                            <td>
                              <Ev value={r.value} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {o.byBoard && o.action === 'check' && (
                  <>
                    <h4>共有カード別の内訳（その後を最善に打ったとき）</h4>
                    <table className="data">
                      <thead>
                        <tr>
                          <th>共有カード</th>
                          <th>確率</th>
                          <th>期待値</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.byBoard.map((r) => (
                          <tr key={r.board}>
                            <td>{r.board}{r.board === myHand ? '（自分がペア）' : ''}</td>
                            <td>{fmtFraction(r.prob)}</td>
                            <td>
                              <Ev value={r.value} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            ))}
          </div>
          {showFuture && (
            <div className="panel">
              <h3>自分（{positionLabel(me)}）の今後の打ち方＝相手の表への最適応答</h3>
              <StrategyTable strategy={sit.myFuture} position={me} compact />
            </div>
          )}
        </>
      )}

      {sit.isTerminal && (
        <div className="callout">ハンドが終了しました。経緯を戻して別の局面を見てください。</div>
      )}
    </div>
  );
}
