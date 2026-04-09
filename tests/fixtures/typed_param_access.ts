import { Order, Discount } from "./types";

function applyDiscountTyped(order: Order, discount: Discount): Order {
  return { ...order, total: order.subtotal - discount.percent };
}
