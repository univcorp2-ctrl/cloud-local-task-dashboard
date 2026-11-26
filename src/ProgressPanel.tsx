import { useCallback, useEffect, useState } from 'react';
import { authHeaders, useOwnerToken } from './controlState';
import './progress.css';

type Agent = { ai: string; sent7: number; rows7: number; lastAt: string | null };
type Contact = { counterpart: string; lastReply?: string; nextFollow?: string; thread?: string | null; result?: string };
type Day = { day: string; sent: number; replies: number };
type Progress = {
  generatedAt: string;
  kpi: { sent?: number; replies?: number; docs?: number; errors?: number; sentUnknownActor?: number };
  agents: Agent[]; ballOurs: Contact[]; due: Contact[]; daily: Day[];
};

const AI_LABEL: Record<string, string> = { claude: 'Claude', muse: 'Muse', antigravity: 'Antigravity', codex: 'Codex', unknown: '記録なし' };
const parseTime = (s?: string | null) => {
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00+09:00` : s;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};
const hoursSince = (s?: string | null) => { const t = parseTime(s); return t === null ? null : (Date.now() - t) / 3_600_000; };
const fmt = (s?: string | null) => {
  const t = parseTime(s);
  if (t === null) return '—';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
};
const lamp = (h: number | null) => h === null ? 'off' : h <= 24 ? 'ok' : h <= 72 ? 'warn' : 'stop';
const lampText = { ok: '24時間以内に動いた', warn: '1〜3日動いていない', stop: '3日以上止まっている', off: '記録なし' } as const;
const safeHref = (u?: string | null) => (u && /^https:\/\//.test(u) ? u : null);

export default function ProgressPanel({ onConnect }: { onConnect: () => void }) {
  const [token] = useOwnerToken();
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/progress', { headers: authHeaders(), credentials: 'same-origin', cache: 'no-store' });
      const j = await r.json() as Progress & { error?: string };
      if (!r.ok) { setError(j.error ?? `HTTP ${r.status}`); return; }
      setError(''); setData(j);
    } catch { setError('network_error'); }
  }, []);
  useEffect(() => { void load(); const id = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(id); }, [load, token]);

  if (error === 'authentication_required' || error === 'invalid_token' || error === 'owner_token_required') {
    return <section className="pg-card"><p>進捗を見るには接続が必要です。</p><button type="button" className="pg-btn" onClick={onConnect}>接続する</button></section>;
  }
  if (error) return <section className="pg-card pg-error"><p>進捗データを読めませんでした（{error}）。60秒後に自動で再試行します。</p></section>;
  if (!data) return <section className="pg-card"><p>読み込み中…</p></section>;

  const k = data.kpi;
  const sent = Number(k.sent ?? 0), replies = Number(k.replies ?? 0);
  const rate = sent ? Math.round((replies / sent) * 1000) / 10 : 0;
  const unknownShare = sent ? Math.round((Number(k.sentUnknownActor ?? 0) / sent) * 100) : 0;
  const maxDay = Math.max(1, ...data.daily.map((d) => Number(d.sent) + Number(d.replies)));

  return (
    <div className="pg">
      <section className={`pg-card pg-alert ${data.ballOurs.length ? 'hot' : 'calm'}`} id="pg-ball">
        <div className="pg-alert-head">
          <h2>相手から返信あり・こちらが未返信</h2>
          <span className="pg-big">{data.ballOurs.length}<small>件</small></span>
        </div>
        {data.ballOurs.length === 0 ? <p className="pg-muted">いまボールがこちらにある相手はいません。</p> : (
          <ul className="pg-list">
            {data.ballOurs.map((c) => {
              const href = safeHref(c.thread);
              const h = hoursSince(c.lastReply);
              return <li key={c.counterpart} className={h !== null && h > 24 ? 'late' : ''}>
                <span className="pg-name">{href ? <a href={href} target="_blank" rel="noreferrer">{c.counterpart}</a> : c.counterpart}</span>
                <span className="pg-meta">{c.result === 'docs_received' ? '資料受領' : '返信'}・{fmt(c.lastReply)}{h !== null && h > 24 ? `（${Math.floor(h / 24)}日放置）` : ''}</span>
              </li>;
            })}
          </ul>
        )}
      </section>

      <section className="pg-kpis" id="pg-kpi" aria-label="直近7日の数字">
        <div className="pg-kpi"><span>送信</span><strong>{sent}</strong><small>直近7日</small></div>
        <div className="pg-kpi"><span>返信・資料</span><strong>{replies}</strong><small>返信率 {rate}%</small></div>
        <div className="pg-kpi"><span>今日が連絡予定</span><strong>{data.due.length}</strong><small>期日超え含む</small></div>
        <div className={`pg-kpi ${unknownShare > 20 ? 'bad' : ''}`}><span>送った人の記録なし</span><strong>{unknownShare}%</strong><small>送信のうち</small></div>
      </section>

      <section className="pg-card" id="pg-agents">
        <h2>AIごとの稼働ランプ</h2>
        <div className="pg-agents">
          {data.agents.map((a) => {
            const l = lamp(hoursSince(a.lastAt));
            return <div key={a.ai} className={`pg-agent ${l}`}>
              <span className="pg-dot" aria-hidden="true" />
              <div><strong>{AI_LABEL[a.ai] ?? a.ai}</strong><small>{lampText[l]}</small></div>
              <div className="pg-agent-num"><b>{a.sent7}</b><small>送信/7日</small></div>
              <div className="pg-agent-last"><small>最後</small>{fmt(a.lastAt)}</div>
            </div>;
          })}
        </div>
      </section>

      <section className="pg-card" id="pg-due">
        <h2>今日フォローする相手</h2>
        {data.due.length === 0 ? <p className="pg-muted">期日が来ている相手はいません。</p> : (
          <ul className="pg-list">
            {data.due.map((c) => {
              const href = safeHref(c.thread);
              return <li key={c.counterpart}>
                <span className="pg-name">{href ? <a href={href} target="_blank" rel="noreferrer">{c.counterpart}</a> : c.counterpart}</span>
                <span className="pg-meta">予定 {fmt(c.nextFollow)}</span>
              </li>;
            })}
          </ul>
        )}
      </section>

      <section className="pg-card" id="pg-daily">
        <h2>日ごとの送信と返信（14日）</h2>
        <div className="pg-bars">
          {data.daily.map((d) => (
            <div key={d.day} className="pg-bar" title={`${d.day} 送信${d.sent}・返信${d.replies}`}>
              <div className="pg-bar-stack" style={{ height: `${((Number(d.sent) + Number(d.replies)) / maxDay) * 100}%` }}>
                <span className="r" style={{ flex: Number(d.replies) || 0 }} />
                <span className="s" style={{ flex: Number(d.sent) || 0 }} />
              </div>
              <small>{d.day.slice(5).replace('-', '/')}</small>
            </div>
          ))}
        </div>
        <p className="pg-legend"><span className="s" />送信 <span className="r" />返信・資料</p>
      </section>
      <p className="pg-foot">出典：Cloudflare D1 hiro-data（send_log）・取得 {fmt(data.generatedAt)}・60秒ごとに更新</p>
    </div>
  );
}
