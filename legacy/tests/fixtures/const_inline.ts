import { Order } from "./types";

function applyDiscount(order: Order, discountAmount: number): Order {
  const newTotal = order.subtotal - discountAmount;
  return { ...order, total: newTotal };
}
