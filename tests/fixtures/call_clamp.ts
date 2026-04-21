import { Order } from "./types";

// Phase 3 target: callee body is a guard chain (if-return sequence with a
// final fallback return). Expected IR lifts to nested `ite`.
function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function clampTotal(order: Order): Order {
  return { ...order, total: clamp(order.subtotal, 0, 1000) };
}
