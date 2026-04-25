import { Order } from "./types";

function ceilTotal(order: Order): Order {
  return { ...order, total: Math.ceil(order.subtotal) };
}
