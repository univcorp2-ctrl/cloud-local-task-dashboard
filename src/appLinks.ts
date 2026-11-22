/** Extensible, public-only app launcher. Add future categories and links here.
 * Never put secrets, private repository URLs or personal task metadata in this list. */
export interface DashboardAppLink {
  id: string;
  label: string;
  url: string;
  category: 'SNS・Muse' | 'Earn Lab' | '不動産' | '旅行・ポイント' | '物販' | '業務' | 'その他';
  description: string;
}
export const dashboardAppLinks: DashboardAppLink[] = [
  { id: 'property-today', label: '今日のおすすめ物件（Notion）', category: '不動産', url: 'https://app.notion.com/p/41210562e58b815cabe2fcdc5db513d1', description: '毎朝の厳選候補。Notionログインが必要な場合があります' },
  { id: 'property-master-notion', label: '統一物件マスターDB（正本台帳）', category: '不動産', url: 'https://app.notion.com/p/25c2ceb7d2d640f0aceefa790d9ee161', description: '全AI共通の物件正本。価格・判断・進捗・資料リンクを確認' },
  { id: 'property-documents-drive', label: '仕入れ候補の物件資料（Drive）', category: '不動産', url: 'https://drive.google.com/drive/folders/1sPPYbCMAtTQPk1rSye5PEsRjRxag68_b', description: '販売図面・登記・レントロール等の原本。Googleログインが必要な場合があります' },

  { id: 'muse-sns-center', label: 'SNS・Muse 統合センター', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/center/', description: '稼働監視・SNS KPI・Muse作業ログ・A/B改善・Drive原本を1か所で確認' },
  { id: 'earnlab-dash', label: 'Earn Lab ダッシュボード', category: 'Earn Lab', url: 'https://app.notion.com/p/40910562e58b811384a2ff02a4b4d4f1', description: 'Notion正本' },
  { id: 'earnlab-db', label: 'Earn Lab 実験DB', category: 'Earn Lab', url: 'https://app.notion.com/p/b2ab0ef9cd664a43836d26fd057bbcdb', description: '全実験' },
  { id: 'revenue-agent', label: '求人応募エージェント', category: 'Earn Lab', url: 'https://revenue-agent-ops.pages.dev/#applications', description: 'Revenue Agent Ops' },
  { id: 'bukken-best10', label: '物件ベスト10レポート', category: '不動産',
    url: 'https://claude.ai/artifact/Px8P2EauNB5Sj3b37JbFhc', description: '毎日3回更新の仕入れ候補（写真・資料請求・仕切り値つき・要ログイン）' },
  { id: 'property-equity-5y', label: '保有不動産｜5年残債・資金余力', category: '不動産',
    url: '/tools/portfolio-equity-5y', description: 'CSV/JSONを端末内で読み込む残債・売却・担保・現金分析（非公開データを送信しない）' },
  { id: 'bukken-customer', label: '物件管理・顧客', category: '不動産',
    url: 'https://bukken-customer.pages.dev/', description: '不動産物件・顧客の管理' },
  { id: 'estateboard', label: 'Estateboard', category: '不動産',
    url: 'https://estateboard.pages.dev/', description: '不動産分析ボード' },
  { id: 'shinchiku-land-viewer', label: '新築土地ビューア', category: '不動産',
    url: 'https://shinchiku-land-viewer.univcorp2.workers.dev/', description: '新築用地の確認' },
  { id: 'marriott-guide', label: 'マリオット無料宿泊 比較ガイド', category: '旅行・ポイント',
    url: '/tools/marriott/', description: '85k特典で泊まれるホテルを総合点・浮く金額・必要ポイント・ラウンジ/朝食で比較' },
  { id: 'ec-api-mcp-map', label: '物販API・MCP対応マップ', category: '物販',
    url: 'https://ec-api-mcp-map.pages.dev/', description: '世界の物販プラットフォームの公式API/MCP対応表とAPI登録手順' },
];
export const appCategories: DashboardAppLink['category'][] = ['SNS・Muse', 'Earn Lab', '不動産', '旅行・ポイント', '物販', '業務', 'その他'];
