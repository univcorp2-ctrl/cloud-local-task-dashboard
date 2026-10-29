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
