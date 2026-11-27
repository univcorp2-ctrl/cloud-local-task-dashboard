import { describe, expect, it } from 'vitest';
import { isVisibleActiveDeal, propertyDealWriteBlockReason, type PropertyDealGate } from '../property-deal-guard';

const base: PropertyDealGate = {
  stage: '資料受領',
  status: '候補継続',
  sale: '販売中',
  nextAction: '接道資料を確認',
  due: '2026-11-30',
  hiroNote: '',
  bodyText: '',
};

describe('property deal visibility and write guard', () => {
  it('shows only active rows with a concrete next action and deadline', () => {
    expect(isVisibleActiveDeal(base)).toBe(true);
    expect(isVisibleActiveDeal({ ...base, due: null })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, nextAction: ' ' })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, stage: '候補' })).toBe(false);
  });

  it('hides duplicate locks even when the stage was overwritten', () => {
    expect(isVisibleActiveDeal({ ...base, stage: '重複統合済' })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, nextAction: '重複統合済。正本へ集約済' })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, bodyText: 'TCC-20261127-DUP-REACTIVATION' })).toBe(false);
    expect(propertyDealWriteBlockReason({ ...base, bodyText: 'TCC-20261127-DUP-REACTIVATION' })).toBe('duplicate_locked');
  });

  it('hides stopped, ended and completed rows', () => {
    expect(isVisibleActiveDeal({ ...base, status: '見送り' })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, sale: '掲載終了' })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, nextAction: '見送り：再検討しない' })).toBe(false);
    expect(isVisibleActiveDeal({ ...base, nextAction: '✅完了(11/27)：確認した' })).toBe(false);
    expect(propertyDealWriteBlockReason({ ...base, sale: '掲載終了' })).toBe('deal_stopped');
  });

  it('blocks owner holds and external waiting states', () => {
    expect(propertyDealWriteBlockReason({ ...base, hiroNote: 'HOLD：外部回答待ち' })).toBe('owner_or_external_hold');
    expect(propertyDealWriteBlockReason({ ...base, hiroNote: '本人GO待ち' })).toBe('owner_or_external_hold');
  });

  it('fails closed on missing next action, deadline and unknown stages', () => {
    expect(propertyDealWriteBlockReason({ ...base, due: null })).toBe('deal_missing_next_step_or_due');
    expect(propertyDealWriteBlockReason({ ...base, nextAction: '' })).toBe('deal_missing_next_step_or_due');
    expect(propertyDealWriteBlockReason({ ...base, stage: '候補' })).toBe('deal_not_active');
  });
});
