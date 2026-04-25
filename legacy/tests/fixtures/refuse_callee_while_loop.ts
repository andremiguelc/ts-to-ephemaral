import { Order } from "./types";

function walk(x: number): number {
  let result = x;
  while (result > 0) {
    result -= 1;
  }
  return result;
}

function apply(order: Order): Order {
  return { ...order, total: walk(order.subtotal) };
}
