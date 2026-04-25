import { Order } from "./types";

function apply(order: Order, a: number, b: number): Order {
  return { ...order, total: Math.abs(Math.max(a, b)) };
}
