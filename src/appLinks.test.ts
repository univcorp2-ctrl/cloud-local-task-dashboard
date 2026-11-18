import { expect, test } from 'vitest';
import { appCategories, dashboardAppLinks } from './appLinks';
test('real-estate launcher contains eight approved destinations', () => {
  const realEstate = dashboardAppLinks.filter(x => x.category === '不動産');
  expect(realEstate.map(x => x.url)).toEqual([
    'https://app.notion.com/p/41210562e58b815cabe2fcdc5db513d1',
    'https://app.notion.com/p/25c2ceb7d2d640f0aceefa790d9ee161',
    'https://drive.google.com/drive/folders/1sPPYbCMAtTQPk1rSye5PEsRjRxag68_b',
    'https://claude.ai/artifact/Px8P2EauNB5Sj3b37JbFhc',
    '/tools/portfolio-equity-5y',
    'https://bukken-customer.pages.dev/',
    'https://estateboard.pages.dev/',
    'https://shinchiku-land-viewer.univcorp2.workers.dev/',
  ]);
  expect(new Set(realEstate.map(x=>x.id)).size).toBe(realEstate.length);
  expect(realEstate.every(x => x.url.startsWith('https://') || x.url.startsWith('/tools/'))).toBe(true);
  expect(appCategories).toContain('物販');
});
test('物販 launcher links the EC API/MCP map', () => {
  const ec = dashboardAppLinks.filter(x => x.category === '物販');
  expect(ec.map(x => x.url)).toContain('https://ec-api-mcp-map.pages.dev/');
  expect(new Set(dashboardAppLinks.map(x => x.id)).size).toBe(dashboardAppLinks.length);
});
