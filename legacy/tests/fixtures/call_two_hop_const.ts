import { Order } from "./types";

function twoHop(x: number, y: number): number {
  const a = x;
  const b = a * 2;
  return b + y;
}

function apply(order: Order, y: number): Order {
  return { ...order, total: twoHop(order.subtotal, y) };
}
