import { describe, it, expect } from 'vitest';
import { toBackground, health } from '../background';
describe('background ledger',()=>{
  it('keeps unknown usage and execution separate from registration',()=>{
    const row=toBackground({id:'a',url:'https://notion.so/a',properties:{'処理名':{title:[{plain_text:'A'}]},'状態':{select:{name:'稼働'}}}});
    expect(row.tokens).toBeNull();expect(row.weeklyPercent).toBeNull();expect(health(row)).toBe('未確認');
  });
  it('flags overdue and invalid dates without calling them healthy',()=>{
    const row=toBackground({id:'a',url:'',properties:{'次回実行':{date:{start:'2026-01-01'}}}});
    expect(health(row,Date.parse('2026-11-19'))).toBe('予定超過');
    expect(health({...row,nextRun:'invalid'})).toBe('未確認');
  });
});
