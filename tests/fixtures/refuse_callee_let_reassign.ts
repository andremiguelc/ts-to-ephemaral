import { Order } from "./types";

function process(x: number): number {
  let y = x;
  y = y * 2;
  return y;
}

function apply(order: Order): Order {
  return { ...order, total: process(order.subtotal) };
}
