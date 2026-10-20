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
  executionOwners?: Array<{ owner: string; taskCount: number }>;
}
interface Quota {
  provider: string; remainingPercent: number | null;
  resetAt: string | null; evidence: string;
  usedPercent?: number | null; weeklyUsedPercent?: number | null;
  windowLabel?: string; quality?: 'measured' | 'estimated' | 'unavailable'; model?: string;
}
interface Catalog {
  generatedAt: string; totalRepositories: number; privateRepositoryCount: number;
  publicRepositoryCount: number; totalUserScheduledTasks: number;
  categories: Category[]; quotas: Quota[];
}
const defaultQuotas: Quota[] = [
  { provider: 'Codex CLI', remainingPercent: null, resetAt: null, evidence: '未接続' },
  { provider: 'Claude Code CLI', remainingPercent: null, resetAt: null, evidence: '未接続' },
  { provider: 'Gemini / Antigravity CLI', remainingPercent: null, resetAt: null, evidence: '未接続' },
  { provider: 'ChatGPT通常Chat', remainingPercent: null, resetAt: null, evidence: '未接続' },
];
const MASTER_NOTION = 'https://app.notion.com/p/3fe10562e58b81aeb778eb9885e62446';
const MANIFEST_FILE = '/data/operations-catalog.json';

export default function OperationsOverview({ section = 'all' }: { section?: 'quota' | 'catalog' | 'all' }) {
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
    {section !== 'catalog' && <section className="panel quota-panel" id="quota" aria-label="AI利用枠・残量">
      <div className="panel-heading">
        <div><span className="section-kicker">AI QUOTA / OWNER</span><h2>AI利用枠の消費率％</h2></div>
        <span className="soft-badge">実測・推定を区別して表示</span>
      </div>
      <p className="quota-compact-note">利用枠に対する<strong>消費％</strong>を大きく表示。ログ実測と推定を区別し、根拠がない場合は推定不能と表示します。</p>
      <div className="quota-grid">
        {(data?.quotas ?? defaultQuotas).map((quota) => {
          const remaining = quota.remainingPercent;
          const used = typeof quota.usedPercent === 'number' ? quota.usedPercent :
            typeof remaining === 'number' ? 100 - remaining : null;
          const reliable = used !== null && Number.isFinite(used) && used >= 0 && used <= 100;
          const quality = quota.quality || (reliable ? 'measured' : 'unavailable');
          return <article className="quota-item" key={quota.provider}>
            <strong className="quota-title">{quota.provider}</strong>
            <div className="quota-main"><span className="quota-value">{reliable ? Math.round(used ?? 0) + '%' : '—%'}</span>
              <span className="quota-kind">{quality === 'estimated' ? '推定使用率' : reliable ? '実測使用率' : '推定不能'}</span></div>
            <span className="quota-track" role="img" aria-label={reliable ? '使用率 ' + used + '%' : '使用率の情報なし'}>
              <span style={{ width: reliable ? used + '%' : '0%' }} />
            </span>
            <small>{quota.windowLabel || '利用枠'}　残り {reliable ? Math.round(100 - used!) + '%' : '不明'}</small>
            {typeof quota.weeklyUsedPercent === 'number' && <small>7日間 使用 {Math.round(quota.weeklyUsedPercent)}%</small>}
            <small>{quota.model ? 'モデル: ' + quota.model + ' ｜ ' : ''}{quota.evidence || '取得元なし'}</small>
          </article>;
        })}
      </div>
    </section>}

    {section !== 'quota' && <section className="panel catalog-panel" id="inventory" aria-label="全リポジトリ・自動化処理台帳">
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
          {(cat.executionOwners?.length ?? 0) > 0 && <p className="category-owners">
            <strong>実行担当:</strong>{' '}
            {cat.executionOwners?.slice(0, 3).map((owner) =>
              <span key={owner.owner}>{owner.owner} ({owner.taskCount}件)</span>)}
          </p>}
          {cat.publicRepositories.length > 0 && <details className="category-repos">
            <summary>公開リポジトリの役割を見る ({cat.publicRepositories.length}件)</summary>
            <div className="category-repo-list">
              {cat.publicRepositories.map((repo) => <div key={repo.url}>
                <a href={repo.url} target="_blank" rel="noreferrer">{repo.name} ↗</a>
                <small>{repo.description || '機能説明未登録・調査対象'}<span>／実行担当: {repo.executionOwner === "unverified" ? "未確認" : repo.executionOwner}</span></small>
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
    </section>}
  </>;
}
