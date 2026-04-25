import { Order } from "./types";

function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function clampTotal(order: Order): Order {
  return { ...order, total: clamp(order.subtotal, 0, 1000) };
}
