import { Order, Discount } from "./types";

function applyDiscount(order: Order, discount: Discount): Order {
  return { ...order, total: order.subtotal - order.subtotal * discount.percent / 100 };
}
