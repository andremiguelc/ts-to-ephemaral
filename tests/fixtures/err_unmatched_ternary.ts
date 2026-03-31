import { Order } from "./types";

function badTernary(order: Order, amount: number): Order {
  return { ...order, total: amount > 0 ? order.subtotal };
}
