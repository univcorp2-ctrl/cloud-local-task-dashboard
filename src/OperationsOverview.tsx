import { useCallback, useEffect, useMemo, useState } from 'react';
interface Repository {
  name: string; url: string; description: string;
  executionOwner: string; verification: string; classificationEvidence: string;
}
interface Category {
  id: string; name: string; purpose: string; repoCount: number;
  privateRepoCount: number; publicRepoCount: number;
  scheduledTaskCount: number; suspectedFailedTaskCount: number;
  publicRepositories: Repository[];
}
interface Quota {
  provider: string; remainingPercent: number | null;
  resetAt: string | null; evidence: string;
}
interface Catalog {
  generatedAt: string; totalRepositories: number; privateRepositoryCount: number;
  publicRepositoryCount: number; totalUserScheduledTasks: number;
  categories: Category[]; quotas: Quota[];
}
const MASTER_NOTION = 'https://app.notion.com/p/3fe10562e58b81aeb778eb9885e62446';
const MANIFEST_FILE = '/data/operations-catalog.json';

export default function OperationsOverview() {
  const [data, setData] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const response = await fetch(MANIFEST_FILE + '?at=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const json: unknown = await response.json();
      if (!json || typeof json !== 'object' || !Array.isArray((json as Catalog).categories)) {
        throw new Error('invalid inventory');
      }
      setData(json as Catalog);
      setError('');
    } catch {
      setError('分類台帳を取得できません。古い表示や見本の数字は使用しません。');
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 120_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const visible = useMemo(() => (data?.categories ?? []).filter((cat) =>
    selected === 'all' || cat.id === selected
  ).filter((cat) => {
    const q = query.trim().toLowerCase();
    return !q || (cat.name + ' ' + cat.purpose + ' ' +
      cat.publicRepositories.map((repo) => repo.name + ' ' + repo.description).join(' ')).toLowerCase().includes(q);
  }), [data, selected, query]);
  const unclassified = data?.categories.find((cat) => cat.id === 'other');
  const lastUpdated = data?.generatedAt ? new Date(data.generatedAt).toLocaleString('ja-JP') : '不明';
  return <>
    <section className="panel quota-panel" id="quota" aria-label="AI利用枠・残量">
      <div className="panel-heading">
        <div><span className="section-kicker">AI QUOTA / OWNER</span><h2>AI担当・トークン残量％</h2></div>
        <span className="soft-badge">実測した利用枠のみ％表示</span>
      </div>
      <p className="catalog-explainer">
        モデルの使用トークン数と、サービスの利用枠の残量％は別の数値です。
        CLIの契約上限とリセット時刻が提供元から取得できない場合、正しい残量％は算出できません。
        使用トークン数は下の「AIトークン消費量」に実測分を掲載しています。
      </p>
      <div className="quota-grid">
        {(data?.quotas ?? [
          { provider: 'Codex CLI', remainingPercent: null, resetAt: null, evidence: '未接続' },
          { provider: 'Claude Code CLI', remainingPercent: null, resetAt: null, evidence: '未接続' },
          { provider: 'Gemini / Antigravity CLI', remainingPercent: null, resetAt: null, evidence: '未接続' },
          { provider: 'ChatGPT通常Chat', remainingPercent: null, resetAt: null, evidence: '未接続' },
        ]).map((quota) => {
          const percent = quota.remainingPercent;
          const reliable = typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100;
          return <article className="quota-item" key={quota.provider}>
            <strong className="quota-title">{quota.provider}</strong>
            <span className="quota-value">{reliable ? Math.round(percent) + '%' : '未取得'}</span>
            <span className="quota-track" role="img" aria-label={reliable ? '残量 ' + percent + '%' : '残量の上限情報なし'}>
              <span style={{ width: reliable ? percent + '%' : '0%' }} />
            </span>
            <small>{reliable ? 'リセット: ' + (quota.resetAt || '不明') : '公式利用枠・残量の実測なし'}</small>
          </article>;
        })}
      </div>
    </section>

    <section className="panel catalog-panel" id="inventory" aria-label="全リポジトリ・自動化処理台帳">
      <div className="panel-heading">
        <div><span className="section-kicker">COMPLETE INVENTORY / CATEGORY</span><h2>全リポジトリ・タスク分類</h2></div>
        <a className="catalog-master-link" href={MASTER_NOTION} target="_blank" rel="noreferrer">
          Notion非公開詳細台帳を開く ↗
        </a>
      </div>
      {error && <p role="alert" className="usage-error">{error}</p>}
      <p className="catalog-explainer">
        GitHub全リポジトリを集計。非公開リポジトリは情報漏えい防止のため、公開ページではカテゴリ別件数のみ表示します。
        リポジトリが存在するだけでは「稼働中」ではありません。担当者・CLIは実行ログ確認前は未検証扱いです。
      </p>
      <div className="catalog-kpis">
        <div><small>GitHubリポジトリ</small><strong>{data?.totalRepositories ?? '—'}</strong><span>非公開 {data?.privateRepositoryCount ?? '—'}件を含む</span></div>
        <div><small>分類カテゴリ</small><strong>{data?.categories.length ?? '—'}</strong><span>分類根拠が薄いものは要確認</span></div>
        <div><small>PC定期タスク</small><strong>{data?.totalUserScheduledTasks ?? '—'}</strong><span>Microsoft標準以外（成功保証なし）</span></div>
        <div><small>用途未特定のリポジトリ</small><strong>{unclassified?.repoCount ?? '—'}</strong><span>次の手動検証対象</span></div>
      </div>
      <div className="catalog-filters">
        <label>カテゴリ <select aria-label="カテゴリを選択" value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="all">すべて</option>
          {(data?.categories ?? []).map((cat) => <option value={cat.id} key={cat.id}>{cat.name} ({cat.repoCount})</option>)}
        </select></label>
        <input placeholder="公開リポジトリ名・役割を検索" aria-label="公開リポジトリ検索"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="category-grid">
        {visible.map((cat) => <article className="category-item" key={cat.id}>
          <div className="category-heading">
            <div><h3>{cat.name}</h3><p>{cat.purpose}</p></div>
            <strong>{cat.repoCount}<small> repo</small></strong>
          </div>
          <div className="category-stats">
            <span>公開 {cat.publicRepoCount} / 非公開 {cat.privateRepoCount}</span>
            <span>定期タスク {cat.scheduledTaskCount}</span>
            {cat.suspectedFailedTaskCount > 0 && <span className="category-fail">要調査 {cat.suspectedFailedTaskCount}</span>}
          </div>
          {cat.publicRepositories.length > 0 && <details className="category-repos">
            <summary>公開リポジトリの役割を見る ({cat.publicRepositories.length}件)</summary>
            <div className="category-repo-list">
              {cat.publicRepositories.map((repo) => <div key={repo.url}>
                <a href={repo.url} target="_blank" rel="noreferrer">{repo.name} ↗</a>
                <small>{repo.description || '機能説明未登録・調査対象'}<span>／実行担当: 未検証</span></small>
              </div>)}
            </div>
          </details>}
          {cat.privateRepoCount > 0 && <p className="category-private">
            非公開 {cat.privateRepoCount}件の名前・機能詳細は公開サイトには掲載しません。
            内部台帳で参照可能です。
          </p>}
        </article>)}
      </div>
      {!data && <p className="usage-empty">リポジトリ台帳を取得中です。未取得の場合はダミー件数を使用しません。</p>}
      <p className="catalog-provenance">
        台帳最終収集: {lastUpdated}／出典: GitHubの認証済みリポジトリ一覧とWindows Task Scheduler。
        会社全体のすべてのGitHub組織・すべての実行端末を保証するものではありません。
        役割の一部はリポジトリ名から推定した仮分類です。
      </p>
    </section>
  </>;
}
