import { Order } from "./types";

function apply(order: Order): Order {
  return { ...order, total: Math.pow(order.subtotal, 2) };
}
