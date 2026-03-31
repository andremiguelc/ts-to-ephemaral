import { Account } from "./types";

function deposit(account: Account, amount: number): Account {
  return { ...account, balance: account.balance + amount };
}
