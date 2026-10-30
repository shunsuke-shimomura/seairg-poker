/**
 * 問題用紙（印刷用）。答えは載せない。
 */
export function WorksheetPage() {
  return (
    <div>
      <div className="row no-print" style={{ marginBottom: '0.6rem' }}>
        <button className="primary" onClick={() => window.print()}>
          印刷する
        </button>
        <span className="muted">ブラウザの印刷ダイアログで「背景のグラフィック」を有効にすると表の網掛けが出ます。A4縦・2枚。</span>
      </div>

      <div className="worksheet">
        <h1>
          読み合いの果てに均衡がある
          <br />
          <small style={{ fontWeight: 'normal', fontSize: '0.8em' }}>Leduc Hold'em ワークショップ　問題用紙</small>
        </h1>
        <p style={{ textAlign: 'right' }}>チーム名：＿＿＿＿＿＿＿＿＿＿</p>

        <h2>ルール（簡約 Leduc Hold'em）</h2>
        <ul>
          <li>
            <b>デッキ</b>：J・Q・K が各2枚、計6枚。2人で対戦。
          </li>
          <li>
            <b>アンティ</b>：各1チップ。非公開カードを1枚ずつ配る。
          </li>
          <li>
            <b>第1ラウンド</b>：ベット額2。先手はチェックかベット。ベットされたら後手はコールかフォールド。先手がチェックしたら後手はチェックかベット。後手がベットしたら先手はコールかフォールド。レイズはない。
          </li>
          <li>
            <b>共有カード</b>：残り4枚から1枚を表にする。
          </li>
          <li>
            <b>第2ラウンド</b>：ベット額4。手順は第1ラウンドと同じ。
          </li>
          <li>
            <b>勝敗</b>：共有カードとペアになった方が勝ち。どちらもペアでなければ手札の高い方。同ランクは折半。
          </li>
        </ul>

        <h2>基本表（相手の表）</h2>
        <p>相手はこの確率で行動します。第2ラウンドは第1ラウンドの経緯によらず同じ確率です。</p>
        <table className="data">
          <thead>
            <tr>
              <th>第1ラウンドの場面</th>
              <th>J</th>
              <th>Q</th>
              <th>K</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>自分からベット（先手の初手、後手はチェックされたとき）</td>
              <td>1/6</td>
              <td>2/6</td>
              <td>5/6</td>
            </tr>
            <tr>
              <td>ベットされたらコール</td>
              <td>1/6</td>
              <td>4/6</td>
              <td>6/6</td>
            </tr>
          </tbody>
        </table>
        <table className="data">
          <thead>
            <tr>
              <th>第2ラウンドの手</th>
              <th>自分からベット</th>
              <th>ベットされたらコール</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ペア（手札＝共有カード）</td>
              <td>6/6</td>
              <td>6/6</td>
            </tr>
            <tr>
              <td>ペアなしの K</td>
              <td>3/6</td>
              <td>4/6</td>
            </tr>
            <tr>
              <td>ペアなしの Q</td>
              <td>1/6</td>
              <td>2/6</td>
            </tr>
            <tr>
              <td>ペアなしの J</td>
              <td>1/6</td>
              <td>0/6</td>
            </tr>
          </tbody>
        </table>

        <h2>問1：ベットから手札を推定する</h2>
        <p>
          <b>あなたは後手で Q。基本表の先手が第1ラウンドでベットした。</b>相手の手札が J・Q・K である確率は？
          <br />
          <small>ヒント：「事前の確率 × その行動を取る確率」の比で考える。</small>
        </p>
        <div className="answer" />
        <p>続けて：相手がチェックしていたら、確率はどう変わるか？</p>
        <div className="answer" />

        <h2>問2：共有カードの確率</h2>
        <p>
          <b>問1でベットされ、あなたはコールした。</b>共有カードが J・Q・K になる確率は？
          <br />
          <small>ヒント：相手の手札ごとに残り4枚の内訳が変わる。</small>
        </p>
        <div className="answer" />

        <div className="page-break" />
        <h2>問3：第2ラウンドの判断</h2>
        <p>
          <b>共有カードは K。ポットは 6（各自アンティ1＋第1ラウンド2）。</b>
        </p>
        <p>(a) 先手がベット（4）してきた。コールかフォールドか。期待値で答える。</p>
        <div className="answer tall" />
        <p>(b) 先手がチェックしてきた。ベットかチェックか。期待値で答える。</p>
        <div className="answer tall" />

        <h2>問4：第1ラウンドでコールすべきか</h2>
        <p>
          <b>問1の場面（後手で Q、基本表の先手がベット）。</b>コールとフォールドのどちらが得か？ まず予想を書き、理由を一言添える。
        </p>
        <div className="answer tall" />

        <h2>メモ：次の問い</h2>
        <ul>
          <li>この最適応答の表で打ち続けたら、相手は黙って負け続けるか？</li>
          <li>相手も表全体でこちらに対応してくる。お互いにそれを繰り返すと、どこに行き着くか？</li>
          <li>60マスの均衡表を覚えて打てるか？</li>
        </ul>
      </div>
    </div>
  );
}
