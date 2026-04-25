import { Order } from "./types";

function process(x: number): number {
  let y = x;
  y += 5;
  return y;
}

function apply(order: Order): Order {
  return { ...order, total: process(order.subtotal) };
}
