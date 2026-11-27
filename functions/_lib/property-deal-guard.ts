export const PROPERTY_ACTIVE_STAGES = ['深掘り済', '資料請求済', '資料受領', '銀行打診', '買付準備', '買付済'] as const;
export const PROPERTY_DUPLICATE_MARKER = 'TCC-20261127-DUP-REACTIVATION';
const DONE_MARK = '✅完了';
const STOP_ACTION = /^(?:重複統合済|見送り|紹介停止|失効|掲載終了)/;
const HOLD_NOTE = /(?:\bHOLD\b|HOLD中|本人(?:GO|承認|判断)待ち|外部回答待ち|再開条件(?:成立|到来)まで|送信(?:停止|禁止)|本人認証待ち)/i;

export interface PropertyDealGate {
  stage: string;
  status: string;
  sale: string;
  nextAction: string;
  due: string | null;
  hiroNote?: string;
  bodyText?: string;
}

export function isDuplicateLocked(input: PropertyDealGate): boolean {
  return input.stage === '重複統合済'
    || input.nextAction.includes('重複統合済')
    || Boolean(input.bodyText?.includes(PROPERTY_DUPLICATE_MARKER));
}

function validDue(due: string | null): boolean {
  return typeof due === 'string'
    && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(due)
    && Number.isFinite(Date.parse(due));
}

export function isVisibleActiveDeal(input: PropertyDealGate): boolean {
  return PROPERTY_ACTIVE_STAGES.includes(input.stage as typeof PROPERTY_ACTIVE_STAGES[number])
    && !isDuplicateLocked(input)
    && input.status !== '見送り'
    && input.sale !== '掲載終了'
    && !STOP_ACTION.test(input.nextAction.trim())
    && Boolean(input.nextAction.trim())
    && !input.nextAction.trim().startsWith(DONE_MARK)
    && validDue(input.due);
}

export function propertyDealWriteBlockReason(input: PropertyDealGate): string | null {
  if (isDuplicateLocked(input)) return 'duplicate_locked';
  if (!PROPERTY_ACTIVE_STAGES.includes(input.stage as typeof PROPERTY_ACTIVE_STAGES[number])) return 'deal_not_active';
  if (input.status === '見送り' || input.sale === '掲載終了' || STOP_ACTION.test(input.nextAction.trim())) return 'deal_stopped';
  if (HOLD_NOTE.test(input.hiroNote ?? '')) return 'owner_or_external_hold';
  if (!input.nextAction.trim() || input.nextAction.trim().startsWith(DONE_MARK) || !validDue(input.due)) return 'deal_missing_next_step_or_due';
  return null;
}
