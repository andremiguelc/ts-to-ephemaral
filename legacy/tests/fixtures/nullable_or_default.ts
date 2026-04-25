import { Order } from "./types";

function applyDiscount(order: Order): Order {
  return { ...order, total: order.subtotal - (order.discount || 0) };
}
