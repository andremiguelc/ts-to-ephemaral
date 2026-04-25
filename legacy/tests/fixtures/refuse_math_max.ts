import { Order } from "./types";

function apply(order: Order, cap: number): Order {
  return { ...order, total: Math.max(order.subtotal, cap) };
}
