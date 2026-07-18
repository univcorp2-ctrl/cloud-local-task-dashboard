import type { TaskSnapshot } from './types';

export const fallbackSnapshot: TaskSnapshot = {
  generatedAt: '2026-07-18T08:45:00Z',
  redacted: true,
  agents: [
    { id: 'local-win', name: 'Office-PC', kind: 'Windows Task Scheduler', status: 'online', lastSeen: '2026-07-18T08:44:20Z', taskCount: 5 },
    { id: 'github', name: 'GitHub Actions', kind: 'Cloud workflow', status: 'online', lastSeen: '2026-07-18T08:43:00Z', taskCount: 4 },
    { id: 'cloudflare', name: 'Cloudflare Workers', kind: 'Cron Triggers', status: 'not-configured', lastSeen: null, taskCount: 0 },
  ],
  tasks: [
    { id: 'backup-drive', name: 'Google Driveバックアップ', source: 'local', environment: 'Office-PC', status: 'success', schedule: '毎日 02:00', lastRun: '2026-07-18T02:00:00Z', nextRun: '2026-07-19T02:00:00Z', durationSeconds: 486, successRate: 99.2, host: 'Office-PC', detail: 'Documents → Drive' },
    { id: 'excel-report', name: '売上Excelレポート生成', source: 'github', environment: 'GitHub Actions', status: 'success', schedule: '平日 07:30', lastRun: '2026-07-18T07:30:00Z', nextRun: '2026-07-20T07:30:00Z', durationSeconds: 132, successRate: 97.8, detail: 'artifact: monthly-report.xlsx' },
    { id: 'system-health', name: 'システム稼働監視', source: 'local', environment: 'Home-Server', status: 'running', schedule: '5分ごと', lastRun: '2026-07-18T08:40:00Z', nextRun: '2026-07-18T08:45:00Z', durationSeconds: 19, successRate: 99.8, host: 'Home-Server' },
    { id: 'mail-digest', name: 'Gmail重要メール集計', source: 'github', environment: 'GitHub Actions', status: 'failed', schedule: '毎時 15分', lastRun: '2026-07-18T08:15:00Z', nextRun: '2026-07-18T09:15:00Z', durationSeconds: 43, successRate: 92.4, detail: 'OAuth refresh required' },
    { id: 'cleanup', name: '一時ファイルクリーンアップ', source: 'local', environment: 'Office-PC', status: 'scheduled', schedule: '毎週 日曜 03:00', lastRun: '2026-07-12T03:00:00Z', nextRun: '2026-07-19T03:00:00Z', durationSeconds: 74, successRate: 100, host: 'Office-PC' },
    { id: 'db-snapshot', name: 'SQLiteスナップショット', source: 'github', environment: 'GitHub Actions', status: 'success', schedule: '6時間ごと', lastRun: '2026-07-18T06:00:00Z', nextRun: '2026-07-18T12:00:00Z', durationSeconds: 61, successRate: 98.7 },
    { id: 'security-scan', name: '依存関係セキュリティスキャン', source: 'github', environment: 'GitHub Actions', status: 'running', schedule: '毎日 09:00', lastRun: '2026-07-18T08:42:00Z', nextRun: '2026-07-19T09:00:00Z', durationSeconds: 168, successRate: 96.1 },
    { id: 'photo-sync', name: '写真フォルダ同期', source: 'local', environment: 'Office-PC', status: 'paused', schedule: '毎日 23:00', lastRun: '2026-07-16T23:00:00Z', nextRun: null, durationSeconds: 905, successRate: 94.5, host: 'Office-PC' }
  ]
};
