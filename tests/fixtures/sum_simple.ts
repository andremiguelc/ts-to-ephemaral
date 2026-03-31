import { Order } from "./types";

function recalculateTotal(order: Order): Order {
  return { ...order, total: order.lineItems.reduce((sum, item) => sum + item.subtotal, 0) };
}
