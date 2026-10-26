import { createCart } from './cart';
import { PosCart, PosSessionContext } from './types';
import {
  CheckoutDraftExpectation,
  acknowledgeCheckoutDraft,
  cancelCheckoutDraft,
  getCheckoutDraft,
  getOrCreateCheckoutDraft,
  saveCheckoutDraftSnapshot
} from '../offline/db';
import { CheckoutDraft } from '../offline/types';

export const cartDraftExpectation = (cart: PosCart): CheckoutDraftExpectation => ({
  scope_key: cart.checkout_scope_key,
  checkout_intent_id: cart.checkout_intent_id,
  client_op_id: cart.client_op_id,
  sale_id: cart.sale_id,
  expected_revision: cart.draft_revision
});

const cartFromDraft = (draft: CheckoutDraft, snapshot: PosCart): PosCart => {
  if (draft.state !== 'DRAFT' && draft.state !== 'LOCALLY_DURABLE') {
    throw new Error('Retired checkout drafts cannot be restored as active carts');
  }
  if (snapshot.checkout_scope_key !== draft.scope_key || snapshot.checkout_intent_id !== draft.checkout_intent_id ||
      snapshot.client_op_id !== draft.client_op_id || snapshot.sale_id !== draft.sale_id ||
      snapshot.pharmacy_id !== draft.pharmacy_id || snapshot.branch_id !== draft.branch_id ||
      snapshot.cashier_id !== draft.cashier_id || snapshot.client_created_at !== draft.client_created_at) {
    throw new Error('Checkout snapshot identity does not match its durable owner');
  }
  return {
    ...snapshot,
    draft_revision: draft.revision,
    checkout_state: draft.state,
    transaction_id: draft.transaction_id,
    queue_id: draft.queue_id
  };
};

export const ensureDurableCartReservation = async (cart: PosCart, customFactory?: IDBFactory): Promise<void> => {
  const current = await getCheckoutDraft(cart.checkout_scope_key, customFactory);
  if (!current || current.state !== 'DRAFT' || current.checkout_intent_id !== cart.checkout_intent_id ||
      current.client_op_id !== cart.client_op_id || current.sale_id !== cart.sale_id ||
      current.client_created_at !== cart.client_created_at || current.revision !== cart.draft_revision) {
    throw new Error('STALE_CHECKOUT_DRAFT: finalization requires the current explicit checkout reservation');
  }
};

export const loadOrCreateDurableCart = async (
  context: PosSessionContext,
  customFactory?: IDBFactory
): Promise<PosCart> => {
  const draft = await getOrCreateCheckoutDraft({
    pharmacy_id: context.pharmacy_id,
    branch_id: context.branch_id,
    cashier_id: context.cashier_id
  }, customFactory);
  if (draft.cart_snapshot) return cartFromDraft(draft, draft.cart_snapshot as unknown as PosCart);
  const cart = createCart({
    ...context,
    checkout_scope_key: draft.scope_key,
    checkout_intent_id: draft.checkout_intent_id,
    client_op_id: draft.client_op_id,
    sale_id: draft.sale_id,
    client_created_at: draft.client_created_at,
    draft_revision: draft.revision
  });
  try {
    const saved = await saveCheckoutDraftSnapshot(cartDraftExpectation(cart), cart as unknown as Record<string, unknown>, customFactory);
    return cartFromDraft(saved, saved.cart_snapshot as unknown as PosCart);
  } catch (error: unknown) {
    // Exactly one bounded contention recovery: load the winner; never overwrite or spin.
    const current = await getCheckoutDraft(draft.scope_key, customFactory);
    if (current && current.checkout_intent_id === draft.checkout_intent_id &&
        current.client_op_id === draft.client_op_id && current.sale_id === draft.sale_id &&
        (current.state === 'DRAFT' || current.state === 'LOCALLY_DURABLE') && current.cart_snapshot) {
      return cartFromDraft(current, current.cart_snapshot as unknown as PosCart);
    }
    const detail = error instanceof Error ? error.message : 'snapshot persistence failed';
    throw new Error(`CHECKOUT_INITIALIZATION_FAILED: durable snapshot was not committed; retry initialization (${detail})`);
  }
};

/** Loads existing checkout evidence without reserving a replacement checkout. */
export const loadExistingDurableCart = async (
  context: PosSessionContext,
  customFactory?: IDBFactory,
): Promise<PosCart | null> => {
  const scopeKey = [context.pharmacy_id, context.branch_id, context.cashier_id]
    .map((value) => value.toLowerCase().trim()).join(':');
  const draft = await getCheckoutDraft(scopeKey, customFactory);
  if (!draft || !draft.cart_snapshot) return null;
  if (draft.state !== 'DRAFT' && draft.state !== 'LOCALLY_DURABLE') return null;
  return cartFromDraft(draft, draft.cart_snapshot as unknown as PosCart);
};

export const persistDurableCart = async (cart: PosCart, customFactory?: IDBFactory): Promise<PosCart> => {
  const saved = await saveCheckoutDraftSnapshot(cartDraftExpectation(cart), cart as unknown as Record<string, unknown>, customFactory);
  return cartFromDraft(saved, saved.cart_snapshot as unknown as PosCart);
};

export const cancelDurableCart = async (cart: PosCart, customFactory?: IDBFactory): Promise<void> =>
  cancelCheckoutDraft(cartDraftExpectation(cart), customFactory);

export const acknowledgeDurableCart = async (cart: PosCart, customFactory?: IDBFactory): Promise<void> => {
  const current = await getCheckoutDraft(cart.checkout_scope_key, customFactory);
  if (!current || current.checkout_intent_id !== cart.checkout_intent_id || current.client_op_id !== cart.client_op_id ||
      current.sale_id !== cart.sale_id || current.revision !== cart.draft_revision) {
    throw new Error('STALE_CHECKOUT_DRAFT: acknowledgment no longer owns this durable checkout');
  }
  await acknowledgeCheckoutDraft(cartDraftExpectation(cart), customFactory);
};
