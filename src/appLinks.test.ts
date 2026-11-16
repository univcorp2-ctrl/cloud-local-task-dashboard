import { expect, test } from 'vitest';
import { appCategories, dashboardAppLinks } from './appLinks';
test('real-estate launcher contains five approved destinations', () => {
  const realEstate = dashboardAppLinks.filter(x => x.category === '不動産');
  expect(realEstate.map(x => x.url)).toEqual([
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
