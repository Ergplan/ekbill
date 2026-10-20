#!/usr/bin/env bash
# The request to Twilio Support for EkBill's sign-in SMS template, so Android fills the code in by itself.
# Prints it; sends nothing and changes nothing. Safe to run at any time.
#
#   deploy/vm/twilio-template.sh
#
# Chrome on Android reads a sign-in SMS on its own (WebOTP) only when the message's last line is
# "@<the site's domain> #<code>". Twilio Verify's standard SMS has no such line, and Verify's custom
# templates are made by Twilio Support, not in the console. This writes the request with this VM's
# domain and the SIDs from .env (SIDs are not secrets; no key or token is read or shown).
#
# When Support answers with the template's SID (HJ followed by 32 characters): either make it the
# Verify service's default template in the Twilio console (Verify > Services > General), or put
# TWILIO_VERIFY_TEMPLATE_SID=HJ... in .env; then deploy/vm/check-env.sh and deploy/vm/up.sh.
# The domain is part of the template: when EkBill moves to another domain, ask for a new one.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

site="$(domain)"
[ -n "$site" ] || { echo "Could not work out the domain. Set EKBILL_DOMAIN in .env first."; exit 1; }
account="${TWILIO_ACCOUNT_SID:-<your Account SID, AC...: Twilio console home page>}"
service="${TWILIO_VERIFY_SERVICE_SID:-<your Verify Service SID, VA...: Verify > Services>}"

# The body Twilio stores: its own placeholders, the domain line last, a blank line before it.
body="{{code}} is your {{friendly_name}} code. Do not share it.

@${site} #{{code}}"
# What a phone receives, to check the 140-character limit WebOTP sets.
sample="${body//\{\{code\}\}/123456}"
sample="${sample//\{\{friendly_name\}\}/EkBill}"

cat <<EOF
== Send this to Twilio Support (console: Help > Create a ticket; subject "Custom Verify template")

Hello, please create a custom Verify SMS template for our service.

Account SID:        ${account}
Verify Service SID: ${service}
Template name:      ekbill-webotp
Locale:             en (please make it the default for the service)
Channel:            SMS
Countries:          India only. No traffic to Canada, Singapore, Malaysia or China.
Purpose:            domain-bound one-time codes for the WebOTP API (Android Chrome autofill)

Message body:
----
${body}
----

== What a phone will receive (${#sample} characters; WebOTP allows 140)
----
${sample}
----
EOF

if [ "${#sample}" -gt 140 ]; then echo "TOO LONG for WebOTP: shorten the first line before sending."; exit 1; fi
echo "{{friendly_name}} is the Verify service's name in the Twilio console: name the service EkBill."
case "$site" in
  *sslip.io) echo "Note: ${site} is the VM's address-based name. If EkBill gets its own domain, ask for a new template then." ;;
esac
