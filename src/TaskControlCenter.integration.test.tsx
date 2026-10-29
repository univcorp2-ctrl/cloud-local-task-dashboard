import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ManualTasksPanel from './ManualTasksPanel';
import DevelopmentProgressPanel from './DevelopmentProgressPanel';
import { quotaTone } from './QuotaStrip';
import '@testing-library/jest-dom/vitest';
afterEach(()=>{cleanup();window.localStorage.clear();vi.unstubAllGlobals();});
const task = {id:'12345678123412341234123456789012', title:'資料作成', url:'https://www.notion.so/task', category:'📝 事務・生活',
  priority:'🔴 最高',status:'🔴 未着手',owner:'👤 人間',executor:'Hiro',due:null,nextAction:'提出',humanAction:'',completed:false};
test('残量ゲージの閾値は50%と30%で切り替わり、未取得は無色',()=>{
  expect(quotaTone(100)).toBe('healthy');
  expect(quotaTone(50)).toBe('healthy');
  expect(quotaTone(49.99)).toBe('warning');
  expect(quotaTone(30)).toBe('warning');
  expect(quotaTone(29.99)).toBe('critical');
  expect(quotaTone(0)).toBe('critical');
  expect(quotaTone(null)).toBe('unknown');
});
test('Notionが完了保存を返した後のみ消え、完了済み表示で再表示される',async()=>{
  const requests:string[]=[];
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async(input:string,init?:RequestInit)=>{
    const endpoint=String(input); requests.push(endpoint+' '+(init?.method||'GET'));
    if(init?.method==='PATCH')return {ok:true,json:async()=>({ok:true,auditLogged:true})};
    return {ok:true,json:async()=>({tasks:[{...task,completed:false}],truncated:false})};
  }));
  render(<ManualTasksPanel/>);
  expect(await screen.findByRole('checkbox',{name:'資料作成を完了'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox',{name:'資料作成を完了'}));
  await waitFor(()=>expect(screen.queryByRole('checkbox',{name:'資料作成を完了'})).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'完了済みも表示'}));
  await waitFor(()=>expect(screen.getByRole('checkbox',{name:'資料作成を完了'})).toBeChecked());
  expect(requests.some(x=>x.includes('/api/private-tasks PATCH'))).toBe(true);
  expect(requests.some(x=>x.includes('showCompleted=true'))).toBe(true);
});
test('Notion更新が失敗すればチェック対象を隠さずエラー表示',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async(_input:string,init?:RequestInit)=>{
    if(init?.method==='PATCH')return {ok:false,status:503};
    return {ok:true,json:async()=>({tasks:[{...task}]})};
  }));
  render(<ManualTasksPanel/>);
  fireEvent.click(await screen.findByRole('checkbox',{name:'資料作成を完了'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Notionへ完了を保存できませんでした');
  expect(screen.getByRole('checkbox',{name:'資料作成を完了'})).toBeInTheDocument();
});
test('Notionが503でも開発タスクはブラウザ内で仮完了・復元・取り消しができる',async()=>{
  const catalog={generatedAt:'2026-10-29T09:00:00Z',progressDefinition:'evidence',
    coverage:{allRepositories:1,public:1,private:0,inspected:1},averageProgress:50,categories:[],
    publicProjects:[{name:'repo',url:'https://github.com/example/repo',category:'other',description:'',phase:'review',
    progressPercent:50,confidence:'low',nextAction:'test',lastAction:'review',lastActionResult:'none',actionStatus:'waiting',
    inspectedAt:'2026-10-29T09:00:00Z',milestones:[]}],
    activeProjects:[{id:'dev',title:'開発A',priority:'P1',progressPercent:50,confidence:'medium',
      executionStatus:'未検証',nextAction:'review',lastActionResult:'waiting',inspectedAt:'2026-10-29T09:00:00Z',phase:'検証段階'}]};
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async(input:string)=>{
    if(String(input).includes('/api/private-tasks'))return {ok:false,status:503};
    return {ok:true,json:async()=>catalog};
  }));
  render(<DevelopmentProgressPanel/>);
  const table=await screen.findByRole('region',{name:'開発の進捗とスタック一覧'});
  const checkbox=within(table).getByRole('checkbox',{name:'開発Aを完了'});
  expect(checkbox).toBeEnabled();
  fireEvent.click(checkbox);
  await waitFor(()=>expect(within(table).queryByRole('checkbox',{name:'開発Aを完了'})).not.toBeInTheDocument());
  expect(window.localStorage.getItem('tcc-development-local-completions-v1')).toContain('"dev"');
  expect(screen.getByRole('alert')).toHaveTextContent('Notionには反映していません');
  fireEvent.click(screen.getByRole('button',{name:'完了済みも表示'}));
  const restored=within(table).getByRole('checkbox',{name:'開発Aを完了'});
  expect(restored).toBeChecked();
  fireEvent.click(restored);
  await waitFor(()=>expect(within(table).getByRole('checkbox',{name:'開発Aを完了'})).not.toBeChecked());
  expect(window.localStorage.getItem('tcc-development-local-completions-v1')).toBe('[]');
});
