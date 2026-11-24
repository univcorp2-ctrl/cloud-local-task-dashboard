import { describe, expect, it } from 'vitest';
import { buildWbs } from '../wbs';
import { toTask, type PrivateTask } from '../notion';

const now = new Date('2026-11-24T12:00:00Z');
const task = (overrides: Partial<PrivateTask> = {}): PrivateTask => ({ id: 'a', url: 'https://www.notion.so/a', title: 'Example', category: '要確認', priority: '', status: '進行中', owner: '', executor: '', assignedAi: 'Claude', autonomy: '', due: null, nextAction: '', humanAction: '', whyHuman: '', executionStatus: '', cashDistance: '', order: null, completed: false, lastEditedAt: now.toISOString(), ...overrides });

describe('WBS from the Notion master', () => {
  it('prefers explicit pillars and resolves parent relation before summary group', () => {
    const result = buildWbs([task({id:'parent',title:'Parent',wbsSummary:'柱1｜Other｜'}), task({id:'child', wbsSummary:'柱3｜Summary｜', parentIds:['parent']})], now);
    expect(result.pillars[2].groups[0].title).toBe('Parent');
    expect(result.pillars[2].groups[0].tasks[0].id).toBe('child');
  });
  it('keeps unclassified tasks visible and counts hold only, excluding archive and completed', () => {
    const result = buildWbs([task(),task({id:'hold',priorityGroup:'⑤保留'}),task({id:'done',completed:true}),task({id:'old',archived:true})],now);
    expect(result.heldCount).toBe(1);
    expect(result.unclassified).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.pillars).toHaveLength(5);
  });
  it('handles JST day deadlines, stale/blocked reasons, Hiro and four weeks', () => {
    const result = buildWbs([task({due:'2026-11-24',assignedAi:'👤 Hiro',wbsSummary:'柱1｜Buy｜'}),task({id:'blocked',executionStatus:'⏸ブロック中',lastEditedAt:'2026-11-16T12:00:00Z',due:'2026-11-23',wbsSummary:'柱1｜Buy｜'}),task({id:'future',due:'2026-12-23',wbsSummary:'柱1｜Buy｜'})],now);
    expect(result.hiro[0].blockedReasons).toEqual([]);
    expect(result.pillars[0].blocked).toBe(1);
    expect(result.pillars[0].groups[0].tasks.find(t=>t.id==='blocked')?.blockedReasons).toHaveLength(3);
    expect(result.schedule.tasks.map(t=>t.id)).toEqual(['a']);
    expect(result.schedule.days).toHaveLength(28);
    expect(result.schedule.days.filter(d=>d.saturday)).toHaveLength(4);
  });
  it('maps deadline before date, full text, hold and relation metadata', () => {
    const mapped = toTask({id:'x',url:'',properties:{'期限':{date:{start:'2026-12-01'}},'期日':{date:{start:'2026-12-02'}},'上位':{relation:[{id:'p'}]},'優先区分':{select:{name:'⑤保留'}},'アーカイブ':{checkbox:true}}});
    expect(mapped.due).toBe('2026-12-01');
    expect(mapped.parentIds).toEqual(['p']);
    expect(mapped.priorityGroup).toBe('⑤保留');
    expect(mapped.archived).toBe(true);
  });
});
