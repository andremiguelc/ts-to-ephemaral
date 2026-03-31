import { Order } from "./types";

function applyDiscount(order: Order): Order {
  const discount = order.discount ?? order.defaultDiscount ?? 0;
  return { ...order, total: order.subtotal - discount };
}
