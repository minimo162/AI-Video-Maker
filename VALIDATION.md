# 検証記録

2026-10-06時点の実装・公開準備記録です。

## 実施済み

- 指定のDOCX仕様書を実行環境へ取得し、全文を読んで実装。元仕様書は配布・公開対象から除外。
- インラインJavaScript 2本の構文検査。
- Node.jsによるコア13項目：JSON型・キー・上限・区間・領域・字幕・尺・画像時刻・拡大範囲・音声本文保持・外部送信API不使用。
- DOM／媒体を模擬した編集ハンドラー16項目：素材再選択、構成再取込／取消／失敗時保持、WAV重複置換／取消、音声状態、区間拒否、並べ替え／削除／取消、字幕再取込、代表画像取消／再実行、コピーの代替。
- 実行時の外部依存なし。公開ファイルは許可リストで選別。機密・認証パターンを点検。

## 未実施と理由

ThinkPad側のChromeに自動操作でローカル試作を開こうとしましたが、ブラウザのURLポリシーによりfile://が拒否されました。別のブラウザ表面・生のCDP・間接的な実行による回避は行っていません。

このため、12秒・2場面の実動画生成・保存・再生、アプリ本体の実ブラウザUI、MP4／WebMコーデック、音声同期、ファイル再選択、タブ非表示時の媒体停止を実機で確認できていません。合成デモ生成コードとprototype.htmlは準備済みですが、保存された試験動画は成果物に含めていません。

### 拒否の正確な内容と適用範囲

ThinkPad側のChromeへ次の操作を要求した際の拒否です。要求はローカルのprototype.htmlをfile://で開く操作でした。

> Browser Use rejected this action due to browser security policy. Reason: The browser URL policy blocks this action. Browser use cannot visit the requested page. The requested URL protocol is not allowed. Allowed protocols: "http:", "https:". The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input.

ブラウザ資料「Local Web Development」は通常のlocalhost、127.0.0.1、::1での開発テストを説明しています。しかし今回の拒否は、同じ結果を迂回・間接実行・別のブラウザ表面で実現することも禁止しています。拒否されたHTMLをローカルHTTPサーバーへ載せ替えて実行する経路は同じ試作の実行になるため、実施していません。一般的なlocalhost対応の記載をこの拒否の解除とは扱っていません。

既存の独立したテストブラウザ／公式Node REPLは、この実行環境のツールに公開されていません。Headless起動、生のCDP、OS経由のブラウザ操作、セキュリティ設定変更による代替も実施していません。GitHubのHTTPS画面操作と公開コード確認は正常でした。接続切れの通知をこの制限の原因と判断していません。

将来、独立した正式なlocalhost試験環境で試験する場合も、その結果はlocalhostモードの結果として記録し、配布するfile://モードの合格と区別する必要があります。現時点ではどちらのモードの実ブラウザ書き出しも未確認です。

### 自動検証29項目の範囲

検証コードはNode.jsのvmでインラインJavaScriptを読み込みます。コア検証は純粋な計算・入力検証を実行します。編集検証は自作の模擬DOM、12秒固定の模擬動画、2秒固定の模擬音声デコードを使い、UIハンドラーの状態遷移を検証します。実DOM、Canvas描画結果、動画デコード、WAVの実デコード、MediaRecorder、音声出力、実ファイル選択ダイアログは実行していません。

| コア | 実行した検証 |
|---|---|
| C01 | 正しい2場面JSONの保存形式往復 |
| C02 | 壊れたJSON・前後の説明文の拒否 |
| C03 | コードフェンス1組の除去 |
| C04 | 重複ID・不正時刻・未知領域・不正効果／字幕位置の拒否 |
| C05 | 場面数・文字数・領域・出力設定・型の上限 |
| C06 | 未知キー警告と許可リストによる除去 |
| C07 | Copilot案が録画メタデータ・領域・出力設定を上書きしないこと |
| C08 | ナレーション再取込でも旧音声本文を保持 |
| C09 | 映像長・音声長・前後余白から尺と場面位置を計算 |
| C10 | 画像時刻の重複除去・48枚上限・不正時刻の拒否 |
| C11 | 拡大の倍率・端補正・初期範囲の計算 |
| C12 | 字幕の幅計算で2行を超える入力を拒否 |
| C13 | 危険な実行／送信API・外部依存・innerHTML代入がソースにないこと |

| 模擬編集 | 実行した検証 |
|---|---|
| E01 | 録画読込と同じ入力の再選択 |
| E02 | 構成適用、無効JSON時の旧案保持 |
| E03 | 有効な構成の再取込を取消した場合の保持 |
| E04 | WAVのID対応、不明音声を手動対応待ちにすること |
| E05 | 音声重複の置換取消と再選択 |
| E06 | ナレーション変更で出力停止、取消で音声状態復帰 |
| E07 | 不正区間拒否と旧区間保持 |
| E08 | 並べ替えでID音声を保持、取消 |
| E09 | 削除の取消で場面と音声を復帰 |
| E10 | 字幕だけの構成再取込では音声を維持 |
| E11 | 代表画像生成の取消・再実行 |
| E12 | クリップボード不可時の手動コピー案内 |
| E13 | 保存データ復元、素材／音声再選択、出力設定復元 |
| E14 | 保存時の音声本文との差を復元後にも検知 |
| E15 | 録画差替え取消時の旧録画維持 |
| E16 | 素材読込取消時の編集データ維持 |

この29項目には、実際の動画書き出し、音声付き動画の再読込、出力動画の尺測定、反復書き出し、書き出し取消、タブ非表示時の媒体中断、90秒同期の合格は含まれていません。これらは以下の手動試験が必要です。

社内Edge、Snipping Toolの実録画、実VOICEVOX音声、Clipchamp変換、90秒同期、実素材の一連作業も未実施です。これらはこの個人PCの自動テストでは証明できません。

## 実装上の注意

- MediaRecorder.isTypeSupportedは候補の判定だけです。資源不足などで失敗し得ます。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
- stopイベントまで待ち、最終dataavailableを収集します。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop_event)
- 媒体のdurationは未確定・無限となる場合があります。通常の録画は有限長を要求し、内部で生成した合成素材だけは12秒の生成時間を採用します。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/duration)
- デコード確認は動画の映像寸法の確認です。音声・同期・視覚品質は人の再生確認が必要です。
- 同期逸脱検出は0.35秒、映像停止検出は1秒の初期実装値です。受入目標±150msを合格判定した値ではありません。
- 録画の一致は名称・サイズ・更新日時・尺・解像度による照合で、暗号学的同一性の保証ではありません。

## ライセンス点検

アプリ・テスト・手順は新規作成。配布物に第三者パッケージ、CDN、フォント、実VOICEVOX素材、元DOCX、Library転送helperを含めません。Node.js標準ライブラリはテスト時のみ使用します。コードにMIT Licenseを付けています。素材の権利は利用者側で確認してください。
