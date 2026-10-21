/** Extensible, public-only app launcher. Add future categories and links here.
 * Never put secrets, private repository URLs or personal task metadata in this list. */
export interface DashboardAppLink {
  id: string;
  label: string;
  url: string;
  category: '不動産' | '物販' | '業務' | 'その他';
  description: string;
}
export const dashboardAppLinks: DashboardAppLink[] = [
  { id: 'bukken-customer', label: '物件管理・顧客', category: '不動産',
    url: 'https://bukken-customer.pages.dev/', description: '不動産物件・顧客の管理' },
  { id: 'estateboard', label: 'Estateboard', category: '不動産',
    url: 'https://estateboard.pages.dev/', description: '不動産分析ボード' },
  { id: 'shinchiku-land-viewer', label: '新築土地ビューア', category: '不動産',
    url: 'https://shinchiku-land-viewer.univcorp2.workers.dev/', description: '新築用地の確認' },
];
export const appCategories: DashboardAppLink['category'][] = ['不動産', '物販', '業務', 'その他'];
