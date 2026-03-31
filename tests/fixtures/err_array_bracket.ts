import { Order } from "./types";

function addItem(order: Order, item: number): Order {
  return { ...order, lineItems: [...order.lineItems, item] };
}
