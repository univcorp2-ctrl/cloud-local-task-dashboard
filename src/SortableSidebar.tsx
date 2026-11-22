import { useEffect, useRef, useState } from 'react';
import { appCategories, dashboardAppLinks } from './appLinks';
import type { DashboardAppLink } from './appLinks';

const ORDER_KEY = 'tcc.sidebar.link-order.v1';
const CATEGORY_KEY = 'tcc.sidebar.category-order.v1';

type DragKind = 'category' | 'link';
type ActiveDrag = {
  kind: DragKind;
  id: string;
  category?: string;
  pointerId: number;
  timer: number;
  started: boolean;
  target: string | null;
};

function readSaved<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function moveWithin(ids: string[], from: string, to: string): string[] {
  if (from === to || !ids.includes(from) || !ids.includes(to)) return ids;
  const next = [...ids];
  const destination = next.indexOf(to);
  next.splice(next.indexOf(from), 1);
  next.splice(destination, 0, from);
  return next;
}

export function sortByOrder<T>(items: T[], order: string[], idOf: (item: T) => string): T[] {
  const index = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = index.get(idOf(a));
    const bi = index.get(idOf(b));
    if (ai === undefined && bi === undefined) return 0;
    return (ai ?? Number.MAX_SAFE_INTEGER) - (bi ?? Number.MAX_SAFE_INTEGER);
  });
}

export default function SortableSidebar() {
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => readSaved(CATEGORY_KEY, []));
  const [linkOrder, setLinkOrder] = useState<Record<string, string[]>>(() => readSaved(ORDER_KEY, {}));
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const active = useRef<ActiveDrag | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(CATEGORY_KEY, JSON.stringify(categoryOrder)); } catch { /* storage disabled */ } }, [categoryOrder]);
  useEffect(() => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(linkOrder)); } catch { /* storage disabled */ } }, [linkOrder]);

  const categories = sortByOrder(appCategories.filter(cat => dashboardAppLinks.some(app => app.category === cat)), categoryOrder, cat => cat);
  const orderedLinks = (category: string) => sortByOrder(dashboardAppLinks.filter(app => app.category === category), linkOrder[category] ?? [], app => app.id);
  const dragKey = (kind: DragKind, category: string | undefined, id: string) => `${kind}:${category ?? 'all'}:${id}`;

  const commitMove = (kind: DragKind, category: string | undefined, source: string, target: string) => {
    if (source === target) return;
    if (kind === 'category') {
      setCategoryOrder(old => moveWithin(sortByOrder(categories, old, c => c), source, target));
    } else if (category) {
      setLinkOrder(old => ({
        ...old,
        [category]: moveWithin(orderedLinks(category).map(app => app.id), source, target),
      }));
    }
  };

  const cancelDrag = () => {
    if (active.current) window.clearTimeout(active.current.timer);
    active.current = null;
    setDragging(null);
    setOver(null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, kind: DragKind, id: string, category?: string) => {
    if (active.current) cancelDrag();
    event.preventDefault();
    const pointerId = event.pointerId;
    const next: ActiveDrag = { kind, id, category, pointerId, started: false, target: null, timer: 0 };
    active.current = next;
    event.currentTarget.setPointerCapture(pointerId);
    next.timer = window.setTimeout(() => {
      if (active.current !== next) return;
      next.started = true;
      setDragging(dragKey(kind, category, id));
    }, event.pointerType === 'mouse' ? 140 : 320);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const item = active.current;
    if (!item || event.pointerId !== item.pointerId || !item.started) return;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-sort-id]');
    const kind = target?.dataset.sortKind;
    const category = target?.dataset.sortCategory;
    if (target && kind === item.kind && (item.kind === 'category' || category === item.category)) {
      item.target = target.dataset.sortId ?? null;
      setOver(item.target ? dragKey(item.kind, item.category, item.target) : null);
    }
    const scrollEl = navRef.current?.closest('nav');
    if (scrollEl) {
      const bounds = scrollEl.getBoundingClientRect();
      if (event.clientY < bounds.top + 44) scrollEl.scrollBy({ top: -18 });
      if (event.clientY > bounds.bottom - 44) scrollEl.scrollBy({ top: 18 });
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const item = active.current;
    if (!item || event.pointerId !== item.pointerId) return;
    if (item.started && item.target) commitMove(item.kind, item.category, item.id, item.target);
    cancelDrag();
  };

  const dragHandle = (kind: DragKind, id: string, category?: string) => (
    <button
      type="button" className="sidebar-sort-handle"
      aria-label={`${id}を長押しして並べ替え`} title="長押しして上下に移動"
      onPointerDown={event => handlePointerDown(event, kind, id, category)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelDrag}
      onContextMenu={event => event.preventDefault()}
    >⠿</button>
  );

  const moveButton = (kind: DragKind, category: string | undefined, id: string, other: string | undefined, direction: '上' | '下') => (
    <button type="button" className="sidebar-sort-step" disabled={!other} aria-label={`${id}を${direction}へ移動`}
      onClick={() => { if (other) commitMove(kind, category, id, other); }}>{direction === '上' ? '↑' : '↓'}</button>
  );

  return (
    <div className="sidebar-app-directory" ref={navRef}>
      <div className="sidebar-reorder-bar">
        <span>アプリ・作業ログ</span>
        <button type="button" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? '完了' : '並べ替え'}</button>
      </div>
      <p className="sidebar-sort-help">{editing ? '⠿ を長押しして上下へ。↑↓でも移動できます。' : '各行の ⠿ を長押しして並べ替え'}</p>
      {categories.map((cat, ci) => {
        const links: DashboardAppLink[] = orderedLinks(cat);
        const catKey = dragKey('category', undefined, cat);
        return (
          <details key={cat} className={`sidebar-app-group${dragging === catKey ? ' is-dragging' : ''}${over === catKey ? ' is-drop-target' : ''}`} data-sort-kind="category" data-sort-id={cat} open>
            <summary>
              <span className="sidebar-summary-title">⌂ {cat}</span>
              <span className="sidebar-summary-actions" onClick={e => e.preventDefault()}>
                {editing && moveButton('category', undefined, cat, categories[ci - 1], '上')}
                {editing && moveButton('category', undefined, cat, categories[ci + 1], '下')}
                {dragHandle('category', cat)}
              </span>
            </summary>
            <div className="sidebar-app-links">
              {links.map((app, i) => {
                const key = dragKey('link', cat, app.id);
                return (
                  <div className={`sidebar-sort-item${dragging === key ? ' is-dragging' : ''}${over === key ? ' is-drop-target' : ''}`} key={app.id}
                    data-sort-kind="link" data-sort-category={cat} data-sort-id={app.id}>
                    <a href={app.url} title={app.description} target="_blank" rel="noopener noreferrer">{app.label}<span aria-hidden="true">↗</span></a>
                    {editing && moveButton('link', cat, app.id, links[i - 1]?.id, '上')}
                    {editing && moveButton('link', cat, app.id, links[i + 1]?.id, '下')}
                    {dragHandle('link', app.id, cat)}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
      <p className="sidebar-sort-footnote">並び順はこの端末に保存されます。</p>
    </div>
  );
}
