export const onRequestGet: PagesFunction = async () => new Response(JSON.stringify({
  ok: true,
  service: 'cloud-local-task-dashboard',
  version: '1.0.0',
  time: new Date().toISOString(),
}), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
