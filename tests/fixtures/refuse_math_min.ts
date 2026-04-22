import { Order } from "./types";

function apply(order: Order, cap: number): Order {
  return { ...order, total: Math.min(order.subtotal, cap) };
}
