import { Order } from "./types";

class Check {
  every(pred: (x: number) => boolean): boolean {
    return pred(42);
  }
}

function userDefinedEvery(order: Order, check: Check): Order {
  // check.every is NOT Array.prototype.every — must not extract as `each`.
  return {
    ...order,
    total: check.every((x) => x > 0) ? order.subtotal : 0,
  };
}
