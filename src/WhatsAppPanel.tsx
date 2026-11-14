import { fmtJst, type EventItem } from './controlState';
import './overview.css';

/**
 * WhatsApp notifications panel.
 * Data source: control-state events with topic === 'whatsapp', written by the
 * tcc-dashboard-sync job (log_event). Events are only returned to authenticated
 * readers by /api/state, so message summaries never appear on the public view.
 * Each event: actor = sender label, message = one-line summary, at = received time.
 */
export default function WhatsAppPanel({ events, connected }: { events: EventItem[]; connected: boolean }) {
  const items = [...events]
    .filter((e) => e.topic === 'whatsapp')
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 10);
  return (
    <section className="panel" aria-label="WhatsApp通知">
      <div className="panel-heading">
        <div><span className="section-kicker">WHATSAPP</span><h2>WhatsApp通知</h2></div>
        <small>{items.length ? `新着順 ${items.length} 件` : ''}</small>
      </div>
      {!connected && <p className="ov-note">WhatsApp通知は認証後に表示されます。</p>}
      {connected && items.length === 0 && (
        <p className="ov-note">新しいWhatsApp通知はありません。WhatsAppと連携すると、新着メッセージの送信者・時刻・要約がここに表示されます。</p>
      )}
      <ul className="ov-events">
        {items.map((e, i) => (
          <li key={`${e.at}-${i}`} className={e.kind}>
            <time>{fmtJst(e.at)}</time>
            <span className="who">{e.actor}</span>
            <span>{e.link ? <a href={e.link} target="_blank" rel="noopener noreferrer">{e.message}</a> : e.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
