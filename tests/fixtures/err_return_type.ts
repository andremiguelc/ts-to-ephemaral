import { Order } from "./types";

function validateOrder(order: Order): boolean {
  return order.total >= 0;
}
