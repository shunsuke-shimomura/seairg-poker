# seai-rg-camp｜Leduc Hold'em ワークショップ「読み合いの果てに均衡がある」

6枚の Leduc Hold'em（J・Q・K 各2枚、レイズなし）を題材に、局面の最善から、均衡と「攻めと守りのトレードオフ」までを7段階で登る90分のワークショップの授業資料です。

- **専用ページ**（Web アプリ、公開版: https://shunsuke-shimomura.github.io/seairg-poker/ ）：主催者が PC で投影して使う計算ツール。局面計算・最適応答（対策の連鎖、読み合いの平均）・手札別の期待値・最悪ケース・CFR による均衡計算・攻めと守り（Restricted Nash Response）・行動表の編集・問題用紙の印刷
- **進行台本**：[docs/進行台本.md](docs/進行台本.md)。各段階の問い・答え・投影する画面・数値。企画書第2版は `poker/新案v2｜…md`（リポジトリ外）
- **問題用紙**：専用ページの「問題用紙」から印刷（答えなし）

## 使い方

Node.js 22 以上。

```sh
npm install
npm run dev        # 開発サーバー（http://localhost:5173）
npm run build      # dist/ に本番ビルド（相対パスなので静的ホスティングや GitHub Pages にそのまま置ける）
npm run preview    # ビルドを確認
npm test           # 企画書の数値（問1〜4、最適応答、最悪ケース、読み合いの平均、RNR など）が再現できることを検査
npm run presets    # 均衡に近い表・読み合いの平均・RNR 曲線を再生成して src/engine/presets.json に書き出す（決定的、約40秒）
npm run report     # 進行台本に載せる数値を一括出力
python3 scripts/lp_equilibrium.py   # 均衡値を線形計画法で厳密に求める（検証用。scipy が必要）
```

## 構成

```
src/engine/            計算エンジン（UI に依存しない）
  game.ts              ルール、情報集合キー、配り方、木の走査（期待値・反実仮想価値）
  bestResponse.ts      最適応答（タイは 1/2）、最悪ケース、対策の連鎖
  cfr.ts               vanilla CFR
  search.ts            1/6 刻みへの丸めと、最悪ケースを改善する座標降下
  dynamics.ts          読み合いの繰り返し（相手のモデル＝直前の表／これまでの平均）と Restricted Nash Response
  situation.ts         局面計算（推定・共有カードの確率・判断の期待値）
  baseTable.ts         基本表
  presets.json         基本表・均衡に近い表・読み合いの平均・CFR の未丸め表・繰り返しと RNR の数値（scripts/generate-presets.ts が生成）
  engine.test.ts       企画書の数値の検査
src/ui/                React の画面（ハッシュルーティング、依存は React のみ）
  pages/               局面計算、最適応答、手札別の期待値、最悪ケース、均衡を求める、攻めと守り、表を作る、問題用紙
  components/          行動表、折れ線グラフ、読み合いの繰り返し
  worker.ts            CFR・座標降下・読み合いの繰り返し・RNR を Web Worker で実行
scripts/               presets 生成、レポート、線形計画法による均衡値の検証
docs/進行台本.md        進行台本
```

## 行動表の表現

戦略は「情報集合キー → ベット／コールする確率」の辞書です。1つの立場につき60マス。

- 第1ラウンド：`r1|bet|J`（先手：初手でベット、後手：チェックされたらベット）、`r1|call|J`（ベットされたらコール）
- 第2ラウンド：`r2|bet|Q|K|oppbet` ＝ 手札Q・共有カードK・経緯「相手がベットし自分がコール」（`mebet`：自分がベットし相手がコール、`check`：両者チェック）

期待値はすべて「1ハンドあたりのチップ（アンティ込みの純増減）」で、先手の値を基準にしています。局面計算の「この時点からの増減」だけは、フォールドを0とし、ポットを取れば過去に入れた分も含めて増減に数える企画書の約束に従っています。

## 設計上の約束

- 最適応答でコールとフォールドの価値が同じマス（タイ）、および相手がそこに来ないので決めようのないマスは 1/2 にする
- 均衡に近い表は、CFR 20000回 → 1/6 刻みに丸め → 最悪ケースを改善する座標降下、で作る。乱数を使わないので再現可能
- 均衡は実装（CFR）で計算している。このゲームはレイズなしの簡略版なので文献の Leduc の均衡表は使えない。代わりに `scripts/lp_equilibrium.py`（sequence form の線形計画法、scipy）で均衡値を厳密に求め、CFR の結果と一致することを確かめてある（厳密値 −0.0781、CFR 20000回 −0.0793、CFR 表の搾取可能性 0.0074）
- 「読み合いの平均」は到達確率で重みづけした平均（sequence form の平均）。これで fictitious play の平均が均衡に収束する
- Restricted Nash Response は、相手が確率 p でモデルどおり・1−p で最適応答してくる制限つきゲームを CFR で解く。p=1 で最適応答、p=0 で均衡になる
- ユーザーが作った表はブラウザの localStorage に保存される。JSON で書き出し・読み込みできる
