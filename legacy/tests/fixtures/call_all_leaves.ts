import { Order } from "./types";

function combine(x: number, y: number, z: number, w: number): number {
  return x * y + z - w;
}

function apply(order: Order, a: number, b: number, c: number): Order {
  return { ...order, total: combine(order.subtotal, a, b, c) };
}
