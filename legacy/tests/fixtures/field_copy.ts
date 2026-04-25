import { Order } from "./types";

function syncTotal(order: Order): Order {
  return { ...order, total: order.subtotal };
}
