import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import WhatsAppPanel from './WhatsAppPanel';
import type { EventItem } from './controlState';
import '@testing-library/jest-dom/vitest';

afterEach(() => { cleanup(); });

const events: EventItem[] = [
  { at: '2026-11-14T01:00:00.000Z', actor: 'Tanaka', kind: 'info', topic: 'whatsapp', message: 'WhatsApp新着: 明日の面談時間を確認したい' },
  { at: '2026-11-14T03:00:00.000Z', actor: 'Sato', kind: 'info', topic: 'whatsapp', message: 'WhatsApp新着: 資料を受け取りました' },
  { at: '2026-11-14T04:00:00.000Z', actor: 'muse', kind: 'info', topic: 'sns', message: 'SNS同期とは無関係のイベント' },
];

describe('WhatsAppPanel', () => {
  it('shows only whatsapp-topic events, newest first', () => {
    render(<WhatsAppPanel events={events} connected />);
    expect(screen.getByText('WhatsApp通知')).toBeInTheDocument();
    expect(screen.getByText(/資料を受け取りました/)).toBeInTheDocument();
    expect(screen.getByText(/面談時間を確認したい/)).toBeInTheDocument();
    expect(screen.queryByText(/無関係のイベント/)).not.toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Sato');
    expect(rows[1]).toHaveTextContent('Tanaka');
  });

  it('shows an empty state when connected with no notifications', () => {
    render(<WhatsAppPanel events={[]} connected />);
    expect(screen.getByText(/新しいWhatsApp通知はありません/)).toBeInTheDocument();
  });

  it('asks for authentication when not connected', () => {
    render(<WhatsAppPanel events={events} connected={false} />);
    expect(screen.getByText(/認証後に表示されます/)).toBeInTheDocument();
  });
});
