import { Account } from "./types";

function withdrawGuarded(account: Account, amount: number): Account {
  if (amount <= 0) return account;
  if (amount > account.balance) return account;
  return { ...account, balance: account.balance - amount };
}
