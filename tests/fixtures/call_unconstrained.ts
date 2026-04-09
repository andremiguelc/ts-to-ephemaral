import { Order } from "./types";

function processOrder(order: Order, rawAmount: string): Order {
  return { ...order, total: parseFloat(rawAmount) };
}
