import { Order } from "./types";

function scaleBySubtotal(subtotal: number): number {
  return subtotal * 2;
}

function apply(order: Order): Order {
  return { ...order, total: scaleBySubtotal(order.subtotal) };
}
