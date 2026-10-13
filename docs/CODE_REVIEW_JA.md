# AI Video Maker コードレビュー（2026-10-14）

対象はブランチ `beginner-docs-review` の先頭コミット `23ce48f` です。既存の [REVIEW.md](../REVIEW.md) は過去のレビューと対応の記録で、このファイルはそれとは別の、現時点のコード全体を読んだ静的レビューです。

**確認方法と限界**

- `index.html`（644行、約186KB）、`prototype.html`、`scripts/package.py`、`tests/*.cjs`、各Markdownを全文読みました。
- ブラウザーでの実行、および `node tests/*.cjs` の実行は、このレビュー環境ではコマンド実行の権限がなく行えていません。以下の指摘はすべてソースの読解に基づくもので、「静的」と明記した項目は実機で再現を確認していません。
- 行番号は上記コミット時点の `index.html` のものです。1行が非常に長い箇所があるため、行番号は「その行の中」を指します。

---

## 1. 何をするツールか

画面録画（MP4/WebM）から、字幕・枠・拡大などの「見せ方」を付けた横長の操作手順動画（MP4またはWebM）を、**ブラウザー1枚の中だけで**作るアプリです。アプリ本体は `index.html` 1ファイルで、サーバー・インストール・ネットワーク通信を使いません（`index.html:5` のCSPと `tests/core.test.cjs:25` の検査で担保）。

想定の流れは4工程です（`index.html:57` の工程ナビ）。

1. **録画**：録画を選び、Copilotに見せる「一覧PNG」（代表画像を最大6枚ずつ束ねたPNG、最大8ファイル）を作る（`index.html:476-482`）。
2. **場面と字幕**：アプリが組み立てた依頼文（`index.html:324-327`）と一覧PNGを、利用者が**手動で** Microsoft 365 Copilot に渡し、返ってきたJSONを貼り付けて取り込む（`index.html:457`）。Copilotを使わず手で場面を作ることもできる（`index.html:628`）。
3. **声（任意）**：Copilotが書いた読み上げ原稿を、利用者が**手動で** VOICEVOX などに渡してWAVを作り、場面IDに対応付けて読み込む（`index.html:459-463`）。字幕のみなら飛ばせる（`audioMode:'none'`）。
4. **動画ファイル**：Canvas と Web Audio を `MediaRecorder` に流して実時間で書き出す（`index.html:561-577`）。MP4（H.264/AAC）を試し、使えなければWebMに自動で切り替える（`index.html:537`, `index.html:572`）。

外部AIサービスへの自動送信・API呼び出しは一切ありません。CopilotとVOICEVOXは「アプリの外」で利用者が操作します。

## 2. 構成（アーキテクチャ）

### ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | アプリ本体。CSS（7-49行）、Coreモジュール（107-212行）、UI/メディア制御（213-644行）の3区画 |
| `prototype.html` | 12秒・2場面の最小書き出し診断。本体とは独立 |
| `00_START_HERE.html` / `.txt` | 利用者向けの最初の案内 |
| `README.md`, `USER_GUIDE.md`, `ACCEPTANCE.md`, `VALIDATION.md`, `REVIEW.md` | 利用手順・受入チェック・検証記録・過去レビュー |
| `tests/*.cjs` | Node.js 標準ライブラリだけで動く模擬テスト7本（依存パッケージなし） |
| `scripts/package.py` | 配布ZIPを許可リストから作る。機密パターンの走査付き |

### index.html の内部構造

**Core（`index.html:110-211`）**は純粋関数の集まりで、DOMやメディアAPIに触れません。`module.exports` で公開され（`index.html:211`）、テストは `vm` でこの区画だけを切り出して実行します（`tests/core.test.cjs:3-6`）。

- `parse`（114行）：Copilot回答のコードフェンス1組を剥がしてJSON化。
- `validate`（115-156行）：保存JSONとCopilot回答の両方を**許可リスト方式**で検証し、未知キーは警告のうえ捨てます。Copilot回答（`proposal=true`）では `source` / `output` / `regions` / `audioMode` を回答から受け取らず、現在の値を保持します（120-123行）。
- `timeline` / `duration`（157-158行）：場面尺の計算。声ありは `max(映像長, 0.15+WAV長+0.25)`、字幕のみは `max(映像長, 0.4)`。
- `sampleTimes` / `selectFrames` / `frameDifference`（160-176行、198-205行）：代表画像の時刻選定。画面差分はタイル単位の最大値で小さな変化を拾います。
- `detailRequest` / `detailTimes`（177-192行）：5分超の録画で使う「範囲選び→詳細画像」の2回目依頼。
- `crop` / `fit` / `wrap`（206-208行）：拡大範囲、画像配置、字幕の2行折返し。

**UI/メディア制御（`index.html:214-643`）**は1つの即時関数の中に、状態変数（216-222行）、表示更新（`update` 317行、`updateWorkflow` 338行、`updateGuidance` 378行）、素材読込（`loadSource` 432行）、取込（`importProposal` 457行、`restore` 458行、`importAudio` 459行）、画像生成（`storyboard` 476行）、描画と再生（`renderScene` 484行、`playTimeline` 504行）、書き出し（`exportVideo` 568行）、練習用素材の合成（`demo` 590行）が並びます。

設計上の特徴は次の3点です。

- **状態は `project`（JSON）と `audios`（Map）だけが正**で、DOMは常に `update()` で作り直すか差分更新します（109行のコメント、317行）。取消履歴は `remember()` で深いコピーを最大50件保持（277行）。
- **非同期処理は `operation` 番号で世代管理**し、取消や差し替えのあとに古いPromiseが解決しても反映しません（例：435行の `check()`、510行、539行）。
- **再生と書き出しが同じ `playTimeline`/`renderScene` を使う**ため、プレビューと出力のずれが起きにくい構造です（483行のコメント）。

## 3. バグ・不具合の候補

いずれも静的読解による指摘です。重要度順に並べます。

### B1. 録画の差し替えを「キャンセル」すると「取得中です」の表示が残る（静的・中）

`loadSource` は段階ごとに `showStage()` で「動画情報の取得中です…」を `sourceFeedback` と上部ステータスに出します（`index.html:434`）。差し替え確認で利用者が「キャンセル」を押すと `return false` で抜けますが（`index.html:444`）、`finally`（454行）はこのメッセージを消しません。`busySet(false)`（276行）も `cancelRequested` のときしかステータスを上書きしません。結果、処理は止まっているのに「取得中です」が残り続けると読めます。既存テストは `sourceInfo` の旧録画名しか確認していません（`tests/editor.test.cjs:41`）。

修正案：444行の `return false` の前に `feedback('sourceFeedback','差し替えを取り消しました。前の録画を保持しています。','notice')` と同趣旨の `note()` を入れる。

### B2. Copilot回答に `title` がないと取り込みが失敗する（静的・中）

`validate` は `title` を必須の文字列として扱い、無いと「title：120文字以内の文字列が必要です」のエラーになります（`index.html:122`, 118行の `str`）。依頼文は `title` を要求していますが（324行）、Copilotが省略した場合、利用者には原因が分かりにくいエラーになります。Copilot回答（`proposal=true`）のときだけ既定の題名を補って警告にする方が、初心者向けの設計意図（「JSONの項目を自分で書く必要はありません」`USER_GUIDE.md:27`）に合います。

### B3. 貼り付けた内容が `null` だと生のTypeErrorが表示される（静的・低）

`importProposal` は `raw.kind` を参照してから検証に入ります（`index.html:457`）。`null` を貼ると `Cannot read properties of null` がそのまま「JSONを取り込めません：…」に続きます。配列や数値は `validate` 側の「オブジェクトが必要です」で止まるので、問題は `null` だけです。`raw?.kind` にするだけで直ります。

### B4. 工程④の案内ボタンの名前が内容と一致しない場合がある（静的・低）

`updateGuidance` の工程④で、声・字幕・区間の問題を除いた残りの `exportIssues()` をすべて「声の表記を確認」と表示し、クレジット欄へ移動します（`index.html:389`）。残り得る問題にはクレジット超過以外（例：領域の不正）も含まれるため、案内先がずれることがあります。ラベルを「保存前の入力を確認」のように中立にするか、問題の種類で分岐させると安全です。

### B5. 大きな構成で `exportIssues()` が1回の更新で何度も走る（静的・効率・低）

`exportIssues()` は全場面の検証と字幕幅の `measureText` を行います（`index.html:311-316`）。これが `update()`（334行）、`updateWorkflow()`（357行）、`updateOutcome()`（371行）、`updateGuidance()`（389行で最大3回）から呼ばれ、1回の操作で5〜6回繰り返されます。600場面まで対応をうたう（`index.html:133`）ので、場面数が多いと入力のたびに重くなる可能性があります。1回の更新サイクルで結果を使い回すと解消します。

### B6. 長い録画の走査に時間がかかり、所要時間の見通しが出ない（設計・低）

144秒を超える録画は最大800点を**順番にシーク**して差分を取ります（`index.html:472-473`）。1回のシークが0.1〜0.3秒なら1時間の録画で1〜4分程度かかる計算です。進捗の件数は出ますが（473行の `note`）、残り時間の目安がないため、初心者は固まったと誤解しやすい点です。

### 問題なしと確認した点

- Copilot回答で録画情報・出力設定・領域・音声モードを上書きできないこと（`index.html:120-123`、`tests/core.test.cjs:15,27`）。
- 未知の領域IDを指す場面は効果を外して通常表示に戻し、字幕と区間は保持すること（`index.html:142-143`）。
- 取消後の古い非同期結果を捨てる世代管理（`index.html:435, 451, 510, 539`）。
- MP4失敗時のWebM再試行で部分出力を保存しないこと（`index.html:572, 575-576`）。
- `__proto__` などの危険なキーが保存データに残らないこと（許可リスト方式、`tests/core.test.cjs:14`）。

## 4. セキュリティとプライバシー

結論：**APIキー・アカウント・環境変数は不要で、コード内に秘密情報はありません。アプリからの外部送信もありません。** 根拠は次のとおりです。

| 観点 | 確認内容 | 根拠 |
|---|---|---|
| ネットワーク | CSPで `default-src 'none'`、`connect-src 'none'`、`font-src 'none'`。`fetch`/`XMLHttpRequest`/`WebSocket`/外部 `<script src>` は不使用 | `index.html:5`、`tests/core.test.cjs:25`、`tests/readability.test.cjs:15` |
| APIキー | Copilot・VOICEVOXともAPI連携なし。手動のコピー＆貼り付けのみ | `index.html:78-79, 85-87`、`README.md:100` |
| 保存先 | `localStorage`/`IndexedDB`/Cookieを使わない。作業は利用者が明示的にJSONをダウンロード | `index.html:622`、本文中に該当APIなし |
| XSS | 文字列は `textContent` で挿入し、`innerHTML` を使わない。Copilot回答やファイル名も同様 | `index.html:292`、`tests/core.test.cjs:25` |
| 正規表現 | WAV名の照合で場面IDをエスケープしてから `RegExp` に渡す。IDは英数字に限定 | `index.html:462`、`index.html:137` |
| 配布物 | `package.py` が許可リストでZIPを作り、トークン・鍵・メール・Windowsユーザーパスのパターンを走査 | `scripts/package.py:7-8, 14-17` |

注意すべき点は次の3つです。

1. **データが端末外へ出るのは、利用者が一覧PNGと依頼文をCopilotへ渡す瞬間だけ**です。一覧PNGは画面全体のスクリーンショットなので、録画に映った個人情報や機密がそのまま含まれます。依頼文にも「見せたい操作」「見る人」「領域名」が入ります（`index.html:324`）。社内ルールに従い、非機密の録画で試すことを `USER_GUIDE.md:170` が案内しています。
2. **エラー詳細のコピーにブラウザーの `userAgent` が入ります**（`index.html:453`）。問い合わせに貼る前提の情報ですが、社外へ送る場合は利用者が内容を確認してください。
3. `script-src 'unsafe-inline'` は単一HTML配布のため必要です。外部スクリプトを読まないので実害は限定的ですが、`index.html` を改変されると検知できません。配布時は `MANIFEST.json` のSHA-256（`scripts/package.py:18, 22`）と照合する運用が有効です。

`prototype.html` も同じ方針で、CSPは `connect-src 'none'` です（`prototype.html:2`）。

## 5. セットアップでつまずきやすい点

- **Edge以外・ZIP内からの起動**：ZIPの中のプレビューや、メールやクラウドのプレビュー表示では動きません（`index.html:53-54`）。展開した `index.html` を右クリック→「プログラムから開く」→ Microsoft Edge が基本です。Chrome や Firefox も API 的には動く可能性がありますが（`index.html:224` は機能の有無しか見ません）、`VALIDATION.md:54` のとおり未検証です。
- **「音声処理の機能がありません」で止まる**：`AudioContext` が無い環境は字幕のみでも起動しません（`index.html:223`）。字幕のみでも無音トラックの時刻維持に Web Audio を使うためです（`index.html:564`）。
- **タブを切り替えると処理が中断する**：書き出し・再生・画像生成中にタブが非表示になると取り消され、部分出力は保存しません（`index.html:638`）。「待っている間に別タブへ」が最も多い失敗パターンだと予想されます。
- **一覧PNGは1つずつリンクを押して保存する**：生成だけでは端末に保存されず、案内も「ダウンロード開始数」を数えて次へ進めます（`index.html:268, 386`）。
- **Copilotの回答は「JSONだけ」を貼る**：説明文付きの回答や、コードフェンスが2組以上あると拒否します（`index.html:114`）。回答の「コードをコピー」を使うのが確実です。
- **WAVの名前は場面IDと一致させる**：`s001.wav` のように場面IDを含む名前だけ自動対応します（`index.html:462`）。RIFF/WAVE以外（MP3など）は拒否します。
- **作業JSONには動画・WAVが入らない**：再開時に同じ録画（声ありならWAVも）を選び直す必要があります（`index.html:458`）。名前・サイズ・更新日時・長さを照合するため、別名保存した録画は「差し替え」扱いになります（`index.html:443-444`）。
- **5分超の録画は依頼が2回**：1回目の回答を貼ると①へ戻って詳細画像が作られます（`index.html:457`）。「場面が出てこない」と感じやすい箇所です。
- **テストはNode.js標準だけで動くが、1本ずつ実行する**：`npm test` や `package.json` はありません（`README.md:84-90`）。`VALIDATION.md:28` は Node v24 で実行した記録で、`Array.prototype.at` や `??=` を使うため Node 16 以降が目安です。
- **配布ZIPに新しいファイルは自動で入らない**：`scripts/package.py:7` の許可リストに列挙したファイルだけがZIPに入ります。今回追加した `docs/` 配下はリストに無いため、配布に含めるなら追記が必要です。また同ファイルの走査はメールアドレス形式の文字列を機密扱いで止めるので（`scripts/package.py:8`）、ドキュメントに連絡先メールを書くと `package.py` が失敗します。

## 6. 改善提案（優先度順）

**P1（信頼性に直結）**

1. **実機受入の完了**：`ACCEPTANCE.md` のT01〜T23・S01〜S06はほぼ「未実施」です。コードの品質以前に、物理PCの社内Edgeで字幕のみ経路の短い書き出しを1回通すことが最優先です。`VALIDATION.md:15` には利用者による短尺MP4の確認が1件ありますが、長尺・取消→再実行・WebM経路は未確認です。
2. **B1（取消後の「取得中」表示）の修正とテスト追加**：`tests/editor.test.cjs:41` のケースに `sourceFeedback` の文言確認を足すと回帰を防げます。

**P2（初心者の失敗を減らす）**

3. **B2・B3の入力耐性**：Copilot回答の `title` 欠落は既定値＋警告に、`null` 貼り付けは分かりやすいメッセージにする。
4. **`package.py` の許可リストに `docs/` を追加**：配布ZIPにこのレビューと入門ガイドを含めるため。追加しない場合はREADMEから `docs/` へのリンクを「GitHub上で読む案内」に限定する。
5. **`index.html` の保守性**：1行が数千文字の行（例：`index.html:351, 386-389`）が多く、差分レビューが困難です。配布は1ファイルのままでも、開発時は `core.js` / `app.js` / `styles.css` に分けて `package.py` で結合する方式にすると、テストの `vm` 切り出し（`tests/workflow.test.cjs:5`）も単純になります。
6. **テスト一括実行の入口**：`tests/run-all.cjs` か `package.json` の `npm test` を用意し、READMEの7コマンドを1つにまとめる。

**P3（品質・効率）**

7. **B5**：`exportIssues()` の結果を更新サイクル内で共有する。
8. **B6**：長尺走査の前に「約N秒の録画をM点確認します（目安x分）」を表示する。
9. **B4**：工程④の案内ラベルを問題の種類に合わせる。
10. **`img-src data:` の削除**：`index.html:5` で許可していますが `data:` 画像は使っていないため、CSPを最小にできます。
11. **Chrome等での動作可否の明示**：`recordingAvailable`（`index.html:224`）が真でも、`requestVideoFrameCallback` 非対応経路（`index.html:420`）は未検証です。起動時に「Edge以外は未検証」と1行出すだけでも問い合わせが減ります。

---

関連ドキュメント：[利用手順](../USER_GUIDE.md)、[受入チェック](../ACCEPTANCE.md)、[検証記録](../VALIDATION.md)、[過去レビュー](../REVIEW.md)、[初心者向けガイド](GETTING_STARTED_JA.md)。
