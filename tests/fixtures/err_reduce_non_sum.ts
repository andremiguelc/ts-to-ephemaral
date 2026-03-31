import { Order } from "./types";

function calculateProduct(order: Order): Order {
  return { ...order, product: order.lineItems.reduce((acc, item) => acc * item.value, 1) };
}
