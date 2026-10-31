import { fmtJst, type Metric } from './controlState';

type ExperimentItem = { experiment_id: string; channel: string; axis: string; title: string; status: string; posts_logged: number | null;
  posts_measured: number | null; reactions: number | null; inquiries: number | null; improvement_pct: number | null; comparable: boolean; decision: string; next_action: string; observed_at: string };
type Journal = { date_jst: string; hypothesis: string; observed_summary: string; learning_summary: string; next_action: string };
export type EstateParts = { experiments?: { ok: boolean; data?: { summary?: Record<string, unknown>; items?: ExperimentItem[]; generated_at?: string } };
  social?: { ok: boolean; data?: { summary?: Record<string, unknown>; generated_at?: string } }; journal?: { ok: boolean; data?: { logs?: Journal[] } } };

const CHANNELS: Array<[string, string, string]> = [['instagram', 'Instagram', 'https://estateboard.pages.dev/social-analytics/innovation/'], ['threads', 'Threads', 'https://estateboard.pages.dev/social-analytics/threads/'], ['facebook', 'Facebook', 'https://estateboard.pages.dev/social-analytics/']];
const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const max = (xs: Array<number | null>) => xs.some((x) => x !== null) ? Math.max(...xs.filter((x): x is number => x !== null)) : null;

export default function SnsPanel({ parts, metrics, fetchedAt }: { parts: EstateParts | null; metrics: Metric[]; fetchedAt?: string }) {
  const items = parts?.experiments?.data?.items ?? [];
  const social = parts?.social?.data?.summary;
  const logs = parts?.journal?.data?.logs ?? [];
  const metric = (id: string) => metrics.find((m) => m.id === id);
  return (
    <section className="panel ov-sns" aria-label="SNS モニタリング">
      <div className="panel-heading"><div><span className="section-kicker">SNS · MUSE</span><h2>投稿・反応・実験</h2></div>
        <small>{fetchedAt ? `取得 ${fmtJst(fetchedAt)}` : ''}</small></div>
      <div className="sns-grid">
        {CHANNELS.map(([key, label, link]) => {
          const mine = items.filter((i) => i.channel === key);
          const followers = metric(`${key}-followers`);
          const best = mine.filter((i) => i.comparable && i.improvement_pct !== null).sort((a, b) => (b.improvement_pct ?? 0) - (a.improvement_pct ?? 0))[0];
          return (
            <a className="sns-card" key={key} href={link} target="_blank" rel="noopener noreferrer">
              <header><strong>{label}</strong><small>{mine.length}実験</small></header>
              <dl>
                <div><dt>フォロワー</dt><dd>{followers ? `${followers.value}` : '—'}</dd></div>
                <div><dt>投稿</dt><dd>{key === 'facebook' && social ? `${n(social.successful_posts) ?? '—'}` : max(mine.map((i) => i.posts_logged)) ?? '—'}</dd></div>
                <div><dt>24h計測</dt><dd>{max(mine.map((i) => i.posts_measured)) ?? '—'}</dd></div>
                <div><dt>反応</dt><dd>{key === 'facebook' && social ? `${n(social.total_engagements) ?? '—'}` : max(mine.map((i) => i.reactions)) ?? '—'}</dd></div>
                <div><dt>問合せ</dt><dd>{max(mine.map((i) => i.inquiries)) ?? '—'}</dd></div>
                <div><dt>比較成立</dt><dd>{mine.filter((i) => i.comparable).length}{best ? ` · 最良 ${best.improvement_pct! >= 0 ? '+' : ''}${Math.round(best.improvement_pct!)}%` : ''}</dd></div>
              </dl>
            </a>
          );
        })}
      </div>
      <div className="sns-cols">
        <div>
          <h3>実験の判定状況</h3>
          <ul className="sns-list">
            {[...items].sort((a, b) => Number(b.comparable) - Number(a.comparable) || (b.posts_measured ?? 0) - (a.posts_measured ?? 0)).slice(0, 8).map((i) => (
              <li key={i.experiment_id}><span className={`sns-status ${i.status}`}>{i.status}</span><strong>{i.title}</strong>
                <small>{i.channel} · 計測{i.posts_measured ?? '—'}/{i.posts_logged ?? '—'} · 反応{i.reactions ?? '—'}{i.comparable && i.improvement_pct !== null ? ` · 改善率 ${i.improvement_pct >= 0 ? '+' : ''}${Math.round(i.improvement_pct)}%` : ' · 比較未成立'}</small>
                {i.next_action && <p>次: {i.next_action}</p>}</li>))}
            {items.length === 0 && <li className="ov-note">実験データを取得中…</li>}
          </ul>
        </div>
        <div>
          <h3>Museの学び（公開ジャーナル）</h3>
          <ul className="sns-list">
            {logs.slice(0, 3).map((l, idx) => <li key={idx}><strong>{l.date_jst} · {l.hypothesis}</strong><small>{l.observed_summary}</small><p>学び: {l.learning_summary}</p><p>次: {l.next_action}</p></li>)}
            {logs.length === 0 && <li className="ov-note">ジャーナル未取得</li>}
          </ul>
          <p className="ov-note">Facebook累計: 公開{n(social?.successful_posts) ?? '—'}・失敗{n(social?.failed_posts) ?? '—'}・保留{n(social?.pending_posts) ?? '—'}。投稿数は実験間で重複するため合算しない。</p>
        </div>
      </div>
    </section>
  );
}
