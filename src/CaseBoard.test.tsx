import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, test, expect, vi } from 'vitest';
import CaseBoard, { ballOwner, isBlocked, requestLabel } from './CaseBoard';
import '@testing-library/jest-dom/vitest';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const task={id:'1',url:'https://www.notion.so/1',title:'戸建て仕入れ',category:'🏠 不動産・民泊',priority:'🔴 最高',status:'🟡 進行中',
 owner:'🤖 AI',executor:'ChatGPT追撃',assignedAi:'🧠 Muse',due:null,nextAction:'業者から資料を取得',humanAction:'',executionStatus:'実行中',completed:false,
 wbsSummary:'[x] 候補発見\n[ ] 資料取得\n[ ] 売買判断'};
test('担当AIを実行レーンより優先、推定で稼働成功にしない',()=>{
 expect(ballOwner(task)).toBe('Muse');
 expect(ballOwner({...task,assignedAi:'⏳ 未割当'})).toBe('ChatGPT通常チャット');
 expect(ballOwner({...task,assignedAi:'⏳ 未割当',executor:'CLIエージェント'})).toBe('担当未割当');
 expect(isBlocked({...task,status:'⏸ ブロック中'})).toBe(true);
 expect(requestLabel({action:'request_docs',result:'sent'} as Parameters<typeof requestLabel>[0])).toContain('受領未照合');
});
test('正本タスクをカテゴリ・ボール・進捗チェックで表示し、媒体未接続は明示',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(input:string)=>{
   if(String(input).includes('private-workflows'))return {ok:true,json:async()=>({generatedAt:'2026-11-13T09:00:00Z',
     actions:{ok:true,items:[]},pipeline:{ok:true,items:[]}})};
   return {ok:true,json:async()=>({tasks:[task],generatedAt:'2026-11-13T09:00:00Z'})};
 }));
 render(<CaseBoard onConnect={()=>undefined}/>);
 expect(await screen.findByText('戸建て仕入れ')).toBeInTheDocument();
 expect(screen.getByText('33%')).toBeInTheDocument();
 expect(screen.getAllByText('Muse').length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('tab',{name:'メール・LINE・Messenger'}));
 await waitFor(()=>expect(screen.getAllByText('受信箱との直接同期未確認').length).toBe(2));
});
test('認証なしでは実タスクを掲載せず失敗理由を表示',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:401}));
 render(<CaseBoard onConnect={()=>undefined}/>);
 expect(await screen.findByText(/接続が必要です/)).toBeInTheDocument();
 expect(screen.queryByText('戸建て仕入れ')).not.toBeInTheDocument();
});
