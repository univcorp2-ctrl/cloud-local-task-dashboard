import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DevelopmentProgressPanel from './DevelopmentProgressPanel';
import '@testing-library/jest-dom/vitest';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const data = {
  generatedAt:'2026-10-21T01:00:00Z',progressDefinition:'evidence',
  coverage:{allRepositories:153,public:1,private:152,inspected:153},
  averageProgress:51,
  activeProjects:[{id:'gpt-follower',title:'GPT Follower｜ChatGPT自動追撃',priority:'P0',progressPercent:70,
    confidence:'medium',executionStatus:'異常コードあり・E2E未確認',nextAction:'同一Chatの追撃E2Eを再検証',
    lastActionResult:'監視ログ照合済み、結果未達',inspectedAt:'2026-10-21T01:00:00Z',phase:'検証段階'}],
  categories:[{id:'real_estate',name:'不動産',repositoryCount:2,privateRepositoryCount:1,averageEvidenceProgress:45}],
  publicProjects:[{
    name:'public-repo',url:'https://github.com/sample/public-repo',category:'real_estate',
    description:'public repo',progressPercent:60,confidence:'low',phase:'実装段階',
    nextAction:'自動テストを実行する',lastAction:'ソース調査',lastActionResult:'ソース確認、テスト実行未達',
    actionStatus:'investigated_pending_execution',inspectedAt:'2026-10-21T01:00:00Z',
    milestones:[{id:'design',label:'設計',weight:15,verified:true},{id:'tests_pass',label:'テスト成功',weight:10,verified:false}]
  }]
};
describe('Development progress: sourced and redacted',()=>{
  it('shows exact coverage, next action and performed result, not guesses',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
    render(<DevelopmentProgressPanel/>);
    await waitFor(()=>expect(screen.getByText('GPT Follower｜ChatGPT自動追撃')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/全153リポジトリの進捗・カテゴリー一覧を開く/));
    expect(screen.getByText('public-repo ↗')).toBeInTheDocument();
    expect(screen.getByText('51.0%')).toBeInTheDocument();
    expect(screen.getByText(/自動テストを実行する/)).toBeInTheDocument();
    expect(screen.getByText(/ソース確認、テスト実行未達/)).toBeInTheDocument();
    expect(screen.queryByText(/secret-private-repo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('進捗の採点根拠を表示'));
    expect(screen.getByText('0 / 10点')).toBeInTheDocument();
  });
  it('never shows invented project percentages when catalog fetch fails',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    render(<DevelopmentProgressPanel/>);
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('取得できません'));
    expect(screen.queryByText('90%')).not.toBeInTheDocument();
  });
});
