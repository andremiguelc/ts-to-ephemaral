import { Order } from "./types";

function apply(order: Order): Order {
  return { ...order, total: Math.abs(order.subtotal) };
}
