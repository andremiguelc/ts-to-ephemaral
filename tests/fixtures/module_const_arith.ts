import { Account } from "./types";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

function setLimit(account: Account): Account {
  return { ...account, dailyWithdrawLimit: MINUTES_PER_DAY };
}
