/** Extensible, public-only app launcher. Add future categories and links here.
 * Never put secrets, private repository URLs or personal task metadata in this list. */
export interface DashboardAppLink {
  id: string;
  label: string;
  url: string;
  category: 'SNS・Muse' | 'Earn Lab' | '不動産' | '物販' | '業務' | 'その他';
  description: string;
}
export const dashboardAppLinks: DashboardAppLink[] = [
  { id: 'sns-innovation', label: 'SNS実験（Muse A/B）', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/innovation/', description: 'Muse の投稿A/B実験の判定' },
  { id: 'sns-kpi', label: 'SNS KPI（全媒体）', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/', description: '媒体別KPI' },
  { id: 'sns-threads', label: 'Threads', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/threads/', description: 'Threads分析' },
  { id: 'sns-journal', label: 'Muse ジャーナル', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/journal/', description: 'Museの仮説・学び' },
  { id: 'sns-logs', label: 'Muse 作業ログ', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/logs/', description: '作業ログ' },
  { id: 'sns-studio', label: 'Muse Studio', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/social-analytics/studio/', description: 'ダッシュボード編集' },
  { id: 'muse-pulse', label: 'Muse Pulse', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/muse-analytics/', description: 'Muse稼働' },
  { id: 'fb-analytics', label: 'Facebook分析', category: 'SNS・Muse', url: 'https://estateboard.pages.dev/facebook-analytics/', description: 'FB投稿分析' },
  { id: 'muse-drive', label: 'Muse 作業ログ（Drive）', category: 'SNS・Muse', url: 'https://drive.google.com/drive/folders/1VSIKAYmE2HmBazhfY2WymHu0ALy7sC0g', description: 'Drive正本' },
  { id: 'earnlab-dash', label: 'Earn Lab ダッシュボード', category: 'Earn Lab', url: 'https://app.notion.com/p/40910562e58b811384a2ff02a4b4d4f1', description: 'Notion正本' },
  { id: 'earnlab-db', label: 'Earn Lab 実験DB', category: 'Earn Lab', url: 'https://app.notion.com/p/b2ab0ef9cd664a43836d26fd057bbcdb', description: '全実験' },
  { id: 'revenue-agent', label: '求人応募エージェント', category: 'Earn Lab', url: 'https://revenue-agent-ops.pages.dev/#applications', description: 'Revenue Agent Ops' },
  { id: 'bukken-customer', label: '物件管理・顧客', category: '不動産',
    url: 'https://bukken-customer.pages.dev/', description: '不動産物件・顧客の管理' },
  { id: 'estateboard', label: 'Estateboard', category: '不動産',
    url: 'https://estateboard.pages.dev/', description: '不動産分析ボード' },
  { id: 'shinchiku-land-viewer', label: '新築土地ビューア', category: '不動産',
    url: 'https://shinchiku-land-viewer.univcorp2.workers.dev/', description: '新築用地の確認' },
];
export const appCategories: DashboardAppLink['category'][] = ['SNS・Muse', 'Earn Lab', '不動産', '物販', '業務', 'その他'];
