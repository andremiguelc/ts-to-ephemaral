import { Order, Discount } from "./types";

function applyDiscountFromLocal(order: Order): Order {
  const discount: Discount = { code: "SAVE10", percent: 10, minOrderValue: 0 };
  return { ...order, total: order.subtotal - discount.percent };
}
