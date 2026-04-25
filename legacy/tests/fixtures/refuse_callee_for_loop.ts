import { Order } from "./types";

function walk(x: number): number {
  let result = x;
  for (let i = 0; i < 10; i++) {
    result += i;
  }
  return result;
}

function apply(order: Order): Order {
  return { ...order, total: walk(order.subtotal) };
}
