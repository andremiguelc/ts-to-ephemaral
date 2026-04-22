import { Order } from "./types";

// The callee-local const `subtotal` happens to share a name with an `Order`
// field. Inside the callee, any reference to `subtotal` should resolve to
// the local const (which traces to `lit(42)`), not to the caller's input
// field. If the parser can't distinguish, it should refuse cleanly; the
// one thing it should NOT do is silently mis-route.
function shadowed(y: number): number {
  const subtotal = 42;
  return subtotal + y;
}

function apply(order: Order, y: number): Order {
  return { ...order, total: shadowed(y) };
}
