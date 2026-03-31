import { Order } from "./types";

function roundTotal(order: Order): Order {
  return { ...order, total: Math.round(order.subtotal) };
}
