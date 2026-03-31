import { Order } from "./types";

function applyDiscount(order: Order): Order {
  const effectiveDiscount = order.discount ?? 0;
  return { ...order, total: order.subtotal - effectiveDiscount };
}
