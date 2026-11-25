/** Manual release helper. Default is validation only; production needs an explicit flag. */
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.some(a => !['--dry-run', '--confirm-production'].includes(a)) || (args.includes('--dry-run') && args.includes('--confirm-production'))) {
  throw new Error('Use --dry-run OR --confirm-production');
}
function run(command) {
  const result = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { stdio: 'inherit', windowsHide: true })
    : spawnSync('sh', ['-c', command], { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
run('pnpm lint');
run('pnpm test');
run('pnpm build');
run('wrangler pages functions build functions --outdir tmp/pages-functions-check');
if (!args.includes('--confirm-production')) {
  console.log('DRY_RUN: validated frontend and Pages Functions; nothing deployed.');
} else {
  run('wrangler whoami');
  run('wrangler pages deploy dist --project-name cloud-local-task-dashboard --branch main --commit-dirty=true');
}
