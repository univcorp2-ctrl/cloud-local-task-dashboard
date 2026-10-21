import { expect, test } from 'vitest';
import { appCategories, dashboardAppLinks } from './appLinks';
test('real-estate launcher contains three public destinations', () => {
  const realEstate = dashboardAppLinks.filter(x => x.category === '不動産');
  expect(realEstate.map(x => x.url)).toEqual([
    'https://bukken-customer.pages.dev/',
    'https://estateboard.pages.dev/',
    'https://shinchiku-land-viewer.univcorp2.workers.dev/',
  ]);
  expect(new Set(realEstate.map(x=>x.id)).size).toBe(realEstate.length);
  expect(realEstate.every(x => x.url.startsWith('https://'))).toBe(true);
  expect(appCategories).toContain('物販');
});
