import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import BackgroundLedger from './BackgroundLedger';
vi.mock('./controlState',()=>({useOwnerToken:()=>['owner'],authHeaders:()=>({Authorization:'Bearer owner'}),fmtJst:(s:string)=>s}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('background display',()=>{
 it('shows unknowns, private headers and searchable real rows',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[{id:'1',title:'Nightly',executor:'Muse',schedule:'daily',status:'要確認',tokens:null,weeklyPercent:null,sharePercent:null,quality:'未取得',url:'https://notion.so/1'}]})});
  vi.stubGlobal('fetch',fetcher);render(<BackgroundLedger/>);
  await screen.findByText('Nightly');expect(fetcher).toHaveBeenCalledWith('/api/private-background',expect.objectContaining({headers:{Authorization:'Bearer owner'},cache:'no-store'}));
  expect(screen.getAllByText('未取得').length).toBeGreaterThan(2);
  fireEvent.change(screen.getByLabelText('処理・担当AIを検索'),{target:{value:'missing'}});
  expect(screen.queryByText('Nightly')).toBeNull();
 });
 it('does not retain previous rows on a failed refresh',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));render(<BackgroundLedger/>);
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('取得できません'));
  expect(screen.queryByText(/処理登録/)).toBeNull();
 });
});
