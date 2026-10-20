#!/usr/bin/env bash
# EkBill's own fee (20 Oct): the UPI payments owners say they made, checked against the bank statement.
#
#   deploy/vm/payments.sh                      claimed payments, oldest first
#   deploy/vm/payments.sh list all             every payment
#   deploy/vm/payments.sh confirm <UTR>        the money is in the bank
#   deploy/vm/payments.sh reject <UTR> [why]   it is not: the month stops counting
#   deploy/vm/payments.sh comp <phone> 2027-03-31   no fee until then (a pilot); "none" takes it away
#
# Runs inside the running app container; reads and changes only plan_payments, referral_joins and
# businesses.plan_comp_until. Every change lands in the audit trail as 'system'.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
app="$(container_of app)"
[ -n "$app" ] || { echo "The app is not running (deploy/vm/up.sh)."; exit 1; }
docker exec -i "$app" node --conditions=react-server --import tsx scripts/payments.mjs "$@"
