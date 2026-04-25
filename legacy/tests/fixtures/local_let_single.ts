import { Account } from "./types";

function deposit(account: Account, amount: number): Account {
  let newBalance = account.balance + amount;
  return { ...account, balance: newBalance };
}
