import { Order } from "./types";

function walk(x: number): number {
  let result = x;
  [1, 2, 3].forEach((i) => {
    result += i;
  });
  return result;
}

function apply(order: Order): Order {
  return { ...order, total: walk(order.subtotal) };
}
