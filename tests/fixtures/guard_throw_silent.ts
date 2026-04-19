import { Account } from "./types";

function depositThrowGuard(account: Account, amount: number): Account {
  // Throw-guard: v0.2.2 silently ignores this. Preconditions mechanism
  // deferred to v0.2.3; this fixture pins current behavior so the
  // v0.2.3 change flips the oracle intentionally.
  if (amount <= 0) throw new Error("amount must be positive");
  return { ...account, balance: account.balance + amount };
}
