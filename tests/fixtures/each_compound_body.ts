import { Order } from "./types";

function markIfAllValid(order: Order): Order {
  return {
    ...order,
    total: order.lineItems.every(
      (item) => item.quantity > 0 && item.unitPrice >= 0,
    )
      ? order.subtotal
      : 0,
  };
}
