import { Order } from "./types";

function recalculateTotal(order: Order): Order {
  return { ...order, total: order.lineItems.reduce((acc, item) => acc + item.price * item.quantity, 0) };
}
