import { Order } from "./types";

function taxedTotal(subtotal: number, pct: number): number {
  const rate = pct / 100;
  return subtotal * rate;
}

function applyTax(order: Order, pct: number): Order {
  return { ...order, total: taxedTotal(order.subtotal, pct) };
}
