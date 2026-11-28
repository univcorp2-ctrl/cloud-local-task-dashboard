import {describe,it,expect} from 'vitest';
import {publicViewResponse,PUBLIC_ARCHIVE_ADS} from '../public-property-view';
describe('archive public reference',()=>{
it('uses verified archive ads, not unrelated public ranking and keeps private details out',async()=>{
const h=await publicViewResponse(new Request('https://x/api/public-properties?bank=kanashin&mode=archive')).text();
expect(h).toContain('class="wrap archive-mode"');expect(h).toContain('かながわ信金・保存分析');expect(h).toContain('15年標準');expect(h).toContain('30年標準');expect(h).toContain('3806405');expect(h).not.toContain('21725490');expect(h.match(/<section class="card">/g)?.length).toBe(PUBLIC_ARCHIVE_ADS.length);expect(h).not.toContain('mail.google.com');expect(h).not.toContain('drive.google.com');
});
});