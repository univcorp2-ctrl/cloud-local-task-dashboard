import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import SortableSidebar, { moveWithin, sortByOrder } from './SortableSidebar';

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

test('カテゴリー内のリンクを上下へ動かせる（リンク自体は残る）', async () => {
  render(<SortableSidebar />);
  fireEvent.click(screen.getByRole('button', { name: '並べ替え' }));
  fireEvent.click(screen.getByRole('button', { name: 'property-master-notionを上へ移動' }));
  const visibleIds = [...document.querySelectorAll<HTMLElement>('[data-sort-category="不動産"]')]
    .map(element => element.dataset.sortId);
  expect(visibleIds[0]).toBe('property-master-notion');
  expect(visibleIds).toContain('property-today');
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('tcc.sidebar.link-order.v1') || '{}');
    expect(saved['不動産'][0]).toBe('property-master-notion');
  });
});

test('カテゴリー自体も上下へ並べ替えられる', () => {
  render(<SortableSidebar />);
  fireEvent.click(screen.getByRole('button', { name: '並べ替え' }));
  fireEvent.click(screen.getByRole('button', { name: 'Earn Labを上へ移動' }));
  const categories = [...document.querySelectorAll<HTMLElement>('[data-sort-kind="category"]')]
    .map(element => element.dataset.sortId);
  expect(categories[0]).toBe('Earn Lab');
  expect(categories).toContain('SNS・Muse');
});

test('未知のIDは保持せず、新しいリンクは末尾に追加する', () => {
  expect(moveWithin(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  expect(moveWithin(['a', 'b'], 'missing', 'b')).toEqual(['a', 'b']);
  expect(sortByOrder([{ id: 'a' }, { id: 'b' }, { id: 'new' }], ['b', 'a', 'removed'], v => v.id)
    .map(v => v.id)).toEqual(['b', 'a', 'new']);
});
