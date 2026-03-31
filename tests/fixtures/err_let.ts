import { Order } from "./types";

function applyDiscount(order: Order, amount: number): Order {
  let newTotal = order.subtotal - amount;
  return { ...order, total: newTotal };
}
