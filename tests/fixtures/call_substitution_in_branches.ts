import { Order } from "./types";

function positivelyDouble(x: number): number {
  return x > 0 ? x * 2 : 0;
}

function apply(order: Order): Order {
  return { ...order, total: positivelyDouble(order.subtotal) };
}
