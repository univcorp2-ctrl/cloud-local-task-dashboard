import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ExecutionPanel from './ExecutionPanel';

describe('ExecutionPanel', () => {
  it('does not show an unavailable inbox as zero replies', () => {
    render(<ExecutionPanel data={null} status={503} />);
    expect(screen.getByText(/実行ログ・返信受信台帳を取得できません/)).toBeInTheDocument();
  });
  it('shows pending reply evidence and explicitly incomplete source coverage', () => {
    render(<ExecutionPanel status={200} data={{generatedAt:'2026-11-26T12:00:00Z',agents:[{ai:'antigravity',lamp:'red',lastAt:null,status:null}],runs:[],pendingTotal:1,pendingTruncated:false,pending:[{account:'bukken511',message_id:'m1',thread_id:'t1',received_at:'2026-11-26T11:00:00Z',owner_ai:'unassigned',status:'pending',evidence_url:'https://mail.google.com/'}],sources:[]}} />);
    expect(screen.getByText(/収集未確認/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/返信を確認/})).toHaveAttribute('href','https://mail.google.com/');
    expect(screen.getByText(/24時間以上無記録/)).toBeInTheDocument();
  });
});
