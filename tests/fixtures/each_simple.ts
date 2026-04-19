import { Order } from "./types";

function markIfAllPositive(order: Order): Order {
  return {
    ...order,
    total: order.lineItems.every((item) => item.quantity > 0)
      ? order.subtotal
      : 0,
  };
}
