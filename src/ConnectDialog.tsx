import { useState } from 'react';
import { authHeaders, redeemPairCode, useConnected, useOwnerToken } from './controlState';

/**
 * Owner connection: paste the access token once per device. It is kept in this browser only
 * and sent as a Bearer header to same-origin APIs (Notion tasks, KPIs, events, MCP state).
 */
export default function ConnectDialog({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useOwnerToken();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  const mcpUrl = `${window.location.origin}/api/mcp`;
  const connected = useConnected();
  const [pairDraft, setPairDraft] = useState('');
  const [pair, setPair] = useState<{ state: 'idle' | 'loading' | 'error'; code: string; url: string }>({ state: 'idle', code: '', url: '' });

  async function issuePair() {
    setPair({ state: 'loading', code: '', url: '' });
    try {
      const response = await fetch('/api/pair', { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: authHeaders() });
      if (!response.ok) throw new Error('rejected');
      const body = await response.json() as { code: string; url: string };
      setPair({ state: 'idle', code: body.code, url: body.url });
    } catch { setPair({ state: 'error', code: '', url: '' }); }
  }

  async function connectWithPair() {
    if (pairDraft.replace(/[^A-Za-z0-9]/g, '').length !== 8) { setStatus('bad'); return; }
    setStatus('checking');
    if (await redeemPairCode(pairDraft)) { setStatus('ok'); window.location.reload(); } else setStatus('bad');
  }

  async function connect() {
    const value = draft.trim();
    if (value.length < 24) { setStatus('bad'); return; }
    setStatus('checking');
    try {
      const response = await fetch('/api/state', { cache: 'no-store', headers: { Authorization: `Bearer ${value}` } });
      if (!response.ok) throw new Error('rejected');
      setToken(value); setDraft(''); setStatus('ok');
    } catch { setStatus('bad'); }
  }

  return (
    <div className="connect-backdrop" role="presentation" onClick={onClose}>
      <div className="connect-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="connect-title">接続設定</h2>
        <p>端末ごとに1回つなぐと、Earn Labの期待値・本人タスク・KPI・活動ログが表示され、その端末は400日間つながったままになります。</p>
        {connected ? (
          <>
            <div className="connect-state ok">接続済み（この端末） {token && <button type="button" onClick={() => { setToken(''); setStatus('idle'); }}>切断</button>}</div>
            <div className="connect-pair">
              <h3>iPhone・iPadをつなぐ（1回だけ）</h3>
              <p>コードを発行して、iPhoneで下のリンクを開くか、iPhoneの接続画面にコードを入れてください。10分以内・1回限り有効。トークンは表示されません。</p>
              <button type="button" onClick={() => void issuePair()} disabled={pair.state === 'loading'}>{pair.state === 'loading' ? '発行中…' : 'ペアリングコードを発行'}</button>
              {pair.code && <div className="connect-pair-code"><strong aria-label="ペアリングコード">{pair.code.replace(/(.{4})/, '$1 ')}</strong><a href={pair.url} target="_blank" rel="noopener noreferrer">{pair.url}</a><button type="button" onClick={() => void navigator.clipboard?.writeText(pair.url)}>リンクをコピー</button></div>}
              {pair.state === 'error' && <p className="connect-error" role="alert">発行できませんでした。再読み込みしてもう一度お試しください。</p>}
            </div>
          </>
        ) : (
          <>
            <div className="connect-form">
              <input inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="ペアリングコード（8文字）" value={pairDraft} onChange={(e) => setPairDraft(e.target.value)} aria-label="ペアリングコード" />
              <button type="button" onClick={() => void connectWithPair()} disabled={status === 'checking'}>{status === 'checking' ? '確認中…' : 'コードで接続'}</button>
            </div>
            <p className="connect-hint">コードは、接続済みのPCでこの画面を開き「ペアリングコードを発行」で出せます。</p>
            <details className="connect-token">
              <summary>アクセストークンで接続する</summary>
              <div className="connect-form">
                <input type="password" autoComplete="off" placeholder="アクセストークンを貼り付け" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="アクセストークン" />
                <button type="button" onClick={() => void connect()} disabled={status === 'checking'}>{status === 'checking' ? '確認中…' : '接続'}</button>
              </div>
            </details>
          </>
        )}
        {status === 'bad' && <p className="connect-error" role="alert">認証されませんでした（コードは10分・1回限りです）。</p>}
        <details className="connect-mcp">
          <summary>AIエージェント用 MCP 接続情報</summary>
          <p>他のAI（Codex・Antigravity・Muse・Claude Code）はこのMCPから残量・KPI・イベントを書き込めます。</p>
          <pre>{`{\n  "url": "${mcpUrl}",\n  "headers": { "Authorization": "Bearer <TCC_AGENT_TOKEN>" }\n}`}</pre>
          <p>ツール: get_state / set_quota / set_kpi / set_metric / log_event / agent_heartbeat（オーナートークンのみ list_private_tasks / complete_private_task）。HTTP: <code>POST /api/state/ingest</code> も同じ認証で使えます。</p>
        </details>
        <button type="button" className="connect-close" onClick={onClose}>閉じる</button>
      </div>
    </div>
  );
}
