import { Order } from "./types";

function calculateSubtotal(order: Order): Order {
  return { ...order, subtotal: order.lineItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) };
}
