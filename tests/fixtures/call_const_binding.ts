import { Order } from "./types";

// Phase 4 target: callee body has a leading `const` binding before the
// return. The existing tryTraceLocal resolves `rate` to its initializer
// during return-expression extraction, so the full composition is:
//   total = subtotal * (pct / 100)
function taxedTotal(subtotal: number, pct: number): number {
  const rate = pct / 100;
  return subtotal * rate;
}

function applyTax(order: Order, pct: number): Order {
  return { ...order, total: taxedTotal(order.subtotal, pct) };
}
