import { Account } from "./types";

function depositIfPositive(account: Account, amount: number): Account {
  if (amount > 0) return { ...account, balance: account.balance + amount };
  return account;
}
