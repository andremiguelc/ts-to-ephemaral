import { Order } from "./types";

function applyDiscountOrZero(order: Order): Order {
  // Null-check guard: pass through when discount is absent.
  if (!order.discount) return order;
  return { ...order, total: order.subtotal - order.discount.percent };
}
