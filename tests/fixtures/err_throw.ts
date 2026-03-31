import { Order } from "./types";

function applyDiscount(order: Order, amount: number): Order {
  if (amount < 0) throw new Error("negative amount");
  return { ...order, total: order.subtotal - amount };
}
