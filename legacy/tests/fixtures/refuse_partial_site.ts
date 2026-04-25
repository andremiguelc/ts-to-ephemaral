import { Order } from "./types";

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// One half composes via round3 (fully inlineable); the other half refuses
// at parseFloat (external-ambient). The site should emit exactly one
// unconstrained while the round3 half shows up as composed IR.
function apply(order: Order, raw: string): Order {
  return { ...order, total: round3(order.subtotal) + parseFloat(raw) };
}
