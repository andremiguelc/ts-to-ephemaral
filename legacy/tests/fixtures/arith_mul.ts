import { Order } from "./types";

function doubleTotal(order: Order): Order {
  return { ...order, total: order.subtotal * 2 };
}
