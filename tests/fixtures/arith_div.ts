import { Order } from "./types";

function halfTotal(order: Order): Order {
  return { ...order, total: order.subtotal / 2 };
}
