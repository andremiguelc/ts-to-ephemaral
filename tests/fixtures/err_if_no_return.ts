import { Order } from "./types";

function badGuard(order: Order, amount: number): Order {
  if (amount < 0) {
    order.total = 0;
  }
  return { ...order, total: order.subtotal - amount };
}
