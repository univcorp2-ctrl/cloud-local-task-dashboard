import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DashboardDirectory from './DashboardDirectory';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
test('一覧は検索可能でユーザー追加リンクから登録台帳へ行ける',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
    schemaVersion:1,registrationUrl:'https://docs.google.com/spreadsheets/d/verified/edit',
    links:[{id:'capital',name:'Bukken DB・キャピタル',category:'不動産',
      url:'https://bukken-customer.pages.dev/capital',status:'partial',note:'検証中'},
      {id:'studio',name:'SNS Studio',category:'SNS',
      url:'https://estateboard.pages.dev/social-analytics/studio/',status:'public',note:'分析'},
      {id:'unsafe',name:'危険なリンク',category:'SNS',
      url:'javascript:alert(1)',status:'public',note:'開いてはならない'}
    ]
  })}));
  render(<DashboardDirectory/>);
  fireEvent.click(screen.getByText('🔗 統合Webアプリ一覧・リンク追加'));
  const real=await screen.findByRole('link',{name:/Bukken DB・キャピタル/});
  expect(real).toHaveAttribute('href','https://bukken-customer.pages.dev/capital');
  expect(screen.getByRole('link',{name:/自分でリンクを追加/})).toHaveAttribute('href',
    'https://docs.google.com/spreadsheets/d/1O8OoxxzNH91wRFdTjyx56Jr6l-_KIdQjUVFeoliuUVM/edit');
  expect(screen.queryByText('危険なリンク')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox',{name:'Webアプリの名前で検索'}),{target:{value:'SNS'}});
  expect(screen.queryByText('Bukken DB・キャピタル')).not.toBeInTheDocument();
  expect(screen.getByText('SNS Studio')).toBeInTheDocument();
});

test('☆でお気に入りに追加するとトップのお気に入り欄に出て、もう一度押すと外れる',async()=>{
  window.localStorage.clear();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({
    schemaVersion:1,registrationUrl:'',
    links:[{id:'bukken-best10',name:'物件ベスト10レポート',category:'不動産',
      url:'https://claude.ai/artifact/Px8P2EauNB5Sj3b37JbFhc',status:'login',note:'要ログイン'}]
  })}));
  render(<><DashboardDirectory mode="pinned"/><DashboardDirectory/></>);
  fireEvent.click(screen.getByText('🔗 統合Webアプリ一覧・リンク追加'));
  const star=await screen.findByRole('button',{name:'お気に入りに追加：物件ベスト10レポート'});
  expect(screen.queryByText('⭐ お気に入り')).not.toBeInTheDocument();
  fireEvent.click(star);
  expect(await screen.findByText('⭐ お気に入り')).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem('tcc.favoriteLinks.v1')??'[]')).toEqual(['bukken-best10']);
  fireEvent.click(screen.getAllByRole('button',{name:'お気に入りから外す：物件ベスト10レポート'})[0]);
  expect(screen.queryByText('⭐ お気に入り')).not.toBeInTheDocument();
});
