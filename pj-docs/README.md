# pj-docs 開発資料ひな型

Webサービス開発プロジェクトを想定した開発資料一式のテンプレートです。
例として、チーム向けタスク管理Webサービス「**TaskFlow**」を題材にしています。
実プロジェクトで使用する際は、プロジェクト名・数値・体制などを実情に合わせて置き換えてください。

## フォルダ構成

| フォルダ | 資料 | 形式 |
| --- | --- | --- |
| [01_proposal](01_proposal/) | 企画書 | Markdown |
| [01_proposal](01_proposal/) | 概要書（経営会議用サマリー） | **Markdown スライド（Marp / 16:9）** |
| [02_requirements](02_requirements/) | 要件定義書 | Markdown |
| [03_kickoff](03_kickoff/) | キックオフ資料（収益予測含む） | Markdown |
| [04_external-design](04_external-design/) | 外部（基本）設計書 | Markdown |
| [05_internal-design](05_internal-design/) | 内部（詳細）設計書 | Markdown |
| [06_coding-standards](06_coding-standards/) | コーディング規約（Playwright等テストツール含む） | Markdown |
| [07_product-review](07_product-review/) | 製品レビュー資料（成果物・完成物レビュー） | **Markdown スライド（Marp / 16:9）** |
| [08_comprehensive-testing](08_comprehensive-testing/) | 総合テスト計画書、テストチェックリスト | Markdown |
| [09_shipment-approval](09_shipment-approval/) | 出荷判定資料、出荷物一覧、リリース計画書 | Markdown |
| [10_post-release-retrospective](10_post-release-retrospective/) | リリース後振り返り | Markdown |
| [11](11/) | 開発途中プロトタイプ画面記録 | Markdown・JPEG |

> フォルダ名・ファイル名はOS依存の文字化けや文字コード事故を避けるため英語表記としています。文書内の記述は日本語のままです。

## 資料作成の流れ（想定フロー）

```mermaid
flowchart LR
    A[企画書/概要書] --> B[要件定義書]
    B --> C[キックオフ資料]
    C --> D[外部設計書]
    D --> E[内部設計書]
    E --> F[コーディング規約]
    F --> G[実装]
    G --> H[総合テスト]
    H --> I[製品レビュー]
    I --> J[出荷判定資料]
    J --> K[リリース]
    K --> L[リリース後振り返り]
```

## スライド資料（Marp）について

以下の資料は、発表・レビュー用に **横長スライドショー形式（16:9）** の Markdown（Marp記法）で作成しています。

- `01_proposal/overview.md`（企画概要書：経営会議・意思決定用サマリー）
- `07_product-review/product-review.md`（製品レビュー資料：最終レビュー会用）

利用にはCLIは不要で、[Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) 拡張機能の導入のみを前提としています。

1. VS CodeでMarp for VS Code拡張機能をインストールする。
2. 対象の `.md` ファイルを開き、エディタ右上のプレビューアイコンからスライドプレビューを表示する。
3. コマンドパレット（`Ctrl+Shift+P`）から `Markdown Preview Enhanced` ではなく `Marp: Export slide deck...` を実行すると、PDF/PPTX/HTML形式でエクスポートできる。

## Markdown資料のPDF化手順

いずれもCLIは不要で、VS Code拡張機能のみでPDF化できます。

### スライド資料（Marp形式）をPDF化する場合

対象：`01_proposal/overview.md`、`07_product-review/product-review.md`

1. [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) 拡張機能をインストールする。
2. 対象の `.md` ファイルをエディタで開く。
3. コマンドパレット（`Ctrl+Shift+P`）を開き、`Marp: Export slide deck...` を実行する。
4. ファイル形式で `PDF` を選択し、保存先を指定する。

### 通常のMarkdown資料をPDF化する場合

対象：上記スライド資料以外のすべての `.md`（企画書、要件定義書、設計書等）

1. [Markdown PDF](https://marketplace.visualstudio.com/items?itemName=yzane.vscode-markdown-pdf) 拡張機能をインストールする。
2. 対象の `.md` ファイルをエディタで開く。
3. コマンドパレット（`Ctrl+Shift+P`）を開き、`Markdown PDF: Export (pdf)` を実行する。
4. 同じフォルダに同名の `.pdf` ファイルが生成される。

> Mermaid図（フローチャート・ER図・ガントチャート等）を含む資料は、拡張機能の設定でMermaidレンダリングが有効になっていることを確認してください（Markdown PDF はデフォルトでMermaidに対応しています）。

## AIを活用した資料作成・開発

GitHub Copilotは、資料の初稿作成、要件の整理、設計案の比較、コード作成、テストケース作成、レビュー補助に利用できます。AIの出力はドラフトとして扱い、最終的な内容・設計・品質の責任は担当者が持ちます。

### 推奨ワークフロー

1. 対象資料、目的、対象範囲、前提条件をCopilotに伝える。
2. 関連する要件定義書・設計書・コーディング規約を参照させる。
3. `[ ]` のプレースホルダー、未確定事項、該当なしの項目を明示させる。
4. 出力を担当者が確認し、実プロジェクトの事実に合わせて修正する。
5. 相互レビューとテストを完了してから資料を確定する。

### GitHub Copilot利用例

#### 要件定義書の整理

```text
このプロジェクトはチーム向けタスク管理Webサービスです。
企画書の内容をもとに、要件定義書の「機能要件一覧」と「非機能要件」を整理してください。
確定していない数値は推測せず、[要確認]として残してください。
既存の資料構成と用語を維持し、抜けている確認事項も最後に列挙してください。
```

#### 実装・テスト案の作成

```text
要件定義書と外部設計書に基づき、タスク作成機能の実装案を作成してください。
コーディング規約に従い、入力検証、認可チェック、エラーハンドリングを含めてください。
単体テスト、PlaywrightによるE2Eテスト、テストデータの前提も示してください。
不明な仕様は実装せず、確認事項として分けてください。
```

#### コードレビュー

```text
この変更を、要件との整合性、セキュリティ、例外処理、性能、保守性、テスト不足の順にレビューしてください。
重大度の高い問題から、ファイル名、該当箇所、問題の理由、修正案を示してください。
問題がない観点は「問題なし」と明記してください。
```

機密情報・認証情報・個人情報・本番データをCopilotへ入力しないでください。AIが生成した内容は、必ず人がレビューし、Lint・テスト・ビルドなどの実行結果で確認してください。利用時の詳細な開発ルールは[コーディング規約](06_coding-standards/coding-standards.md)を参照してください。

プロジェクト固有の構築ワークフローは [GitHub Copilot Skill](../.github/skills/webapp-project-builder/SKILL.md) にも定義しています。Skillはコーディング規約と対象資料の確認を必須とし、実装・Playwrightテスト・検証までを一連の手順として扱います。

## 使い方

1. 各フォルダの `.md` を実プロジェクト用にコピーして編集してください。
2. `[ ]` で囲まれた項目はプレースホルダーです。実情報に置き換えてください。
3. 表や見出し構成は最低限のひな型です。プロジェクト規模に応じて章立てを追加・削除してください。
