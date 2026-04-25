import { Order } from "./types";

function countdown(x: number): number {
  return countdown(x - 1);
}

function trigger(order: Order): Order {
  return { ...order, total: countdown(order.subtotal) };
}
