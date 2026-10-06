# UX audit backlog

## Accepted by design

- **Billing dashboard uses metric boxes (KPI tiles).** Billing is the sanctioned
  exception to the no-KPI-tiles design law — money is the one place numbers are
  the content (C13 §6, BILLING-DASHBOARD-BUILD). Constraints that keep it inside
  the law's spirit: no red badges, no alarm colors; attention = wine numerals +
  worded meaning lines; every box answers one question in plain words and opens
  a panel whose fixes are one tap each. Do not flag the six boxes on
  `/practitioner/billing` in future UX passes; do flag any *new* KPI tiles
  elsewhere, and any drift on this page toward alarm styling.
