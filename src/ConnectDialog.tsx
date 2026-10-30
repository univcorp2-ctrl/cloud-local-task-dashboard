import { useState } from 'react';
import { useOwnerToken } from './controlState';

/**
 * Owner connection: paste the access token once per device. It is kept in this browser only
 * and sent as a Bearer header to same-origin APIs (Notion tasks, KPIs, events, MCP state).
 */
export default function ConnectDialog({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useOwnerToken();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  const mcpUrl = `${window.location.origin}/api/mcp`;

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
        <p>アクセストークンを1回貼ると、この端末でNotionタスク・KPI・活動ログが表示され、完了チェックがNotionへ反映されます。トークンはこのブラウザにだけ保存されます。</p>
        {token ? (
          <div className="connect-state ok">接続済み（この端末） <button type="button" onClick={() => { setToken(''); setStatus('idle'); }}>切断</button></div>
        ) : (
          <div className="connect-form">
            <input type="password" autoComplete="off" placeholder="アクセストークンを貼り付け" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="アクセストークン" />
            <button type="button" onClick={() => void connect()} disabled={status === 'checking'}>{status === 'checking' ? '確認中…' : '接続'}</button>
          </div>
        )}
        {status === 'bad' && <p className="connect-error" role="alert">トークンが認証されませんでした。</p>}
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
