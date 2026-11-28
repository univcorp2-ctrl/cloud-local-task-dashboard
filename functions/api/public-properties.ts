import {publicView} from '../_lib/public-property-view';
interface Env {HIRO_DATA?:D1Database}
export const onRequestGet:PagesFunction<Env>=async({request,env})=>publicView(request,env.HIRO_DATA);
