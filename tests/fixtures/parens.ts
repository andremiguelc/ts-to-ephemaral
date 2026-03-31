import { Order } from "./types";

function scaledTotal(order: Order, factor: number): Order {
  return { ...order, total: (order.subtotal + 10) * factor };
}
