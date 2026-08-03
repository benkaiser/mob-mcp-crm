---
# mob-crm-2451
title: Profile shows approximate age as birth year (e.g. ~2016 yrs)
status: completed
type: bug
priority: normal
created_at: 2026-08-03T00:07:45Z
updated_at: 2026-08-03T00:12:58Z
---

## Symptom
On a contact profile, when a contact has an approximate age/birth year, the age badge renders incorrectly as e.g. `~2016 yrs` instead of the actual age. It should show `~10 years` (in 2026), and naturally increment to `~11 years` in 2027, etc. The 4-digit value being shown is a year, not an age.

## Expected
- The profile age badge shows the derived AGE in years (e.g. ~10 years), never a 4-digit year.
- For approximate birthdays it must be derived from the stored birth year so it increments each calendar year.
- Preferred display format per the user: a leading tilde + 'years', e.g. `~10 years` (current code renders `{age}{approximate?'~':''} yrs` — a trailing tilde and 'yrs'; update to the user's desired representation).

## Relevant code
- Display: `web/src/pages/contacts/ContactProfileView.tsx` (~line 159): `{typeof p.age === 'number' && <Badge>{p.age}{p.age_approximate ? '~' : ''} yrs</Badge>}`.
- Age computation: `src/services/contacts.ts` `calculateAge()` (~lines 128-160) and `mapRow()` (~1041-1053) which sets `contact.age`/`contact.age_approximate`.
- The field `birthday_year_approximate` is documented everywhere as a BIRTH YEAR (web form label 'Approximate birth year' in `web/src/pages/contacts/ContactForm.tsx` ~264-268; MCP tool descriptions in `src/server/mcp-server.ts` ~147-152, 1529-1534). calculateAge does `currentYear - birthday_year_approximate`.

## Likely root cause (verify by reproducing)
Given the codebase treats `birthday_year_approximate` as a birth year and `calculateAge` already computes `currentYear - birthYear`, a value of 2016 would yield age 10. The observed `~2016 yrs` implies EITHER (a) some capture path stored an approximate AGE (e.g. 10) into `birthday_year_approximate` (a year field), so calculateAge mis-computes `2026-10=2016`; OR (b) the raw birth year leaks into the displayed `age` without going through calculateAge in some path. Reproduce first, then fix the true root cause. If (a), normalize age→birth-year at the point of capture (birthYear = currentYear - age) so it increments yearly, and consider guarding calculateAge against implausibly small 'year' values.

## Checklist
- [x] Write a failing test reproducing the '~2016 yrs' (age shown as a 4-digit year) behavior
- [x] Identify + fix the root cause so the profile shows the correct derived age that increments yearly
- [x] Update the display format to '~N years' (leading tilde, 'years')
- [x] Regression test(s) for approximate-age profiles (service level + e2e if practical)
- [x] typecheck + lint + vitest green

## Implementation notes

Reproduced candidate (a): passing `birthday_year_approximate: 10` caused `calculateAge()` to return `2016` in 2026, proving the displayed value was computed from an age accidentally stored in a birth-year field rather than a raw birth year leaking directly to the UI. The fix normalizes clearly age-like approximate values (0-150) to a birth year at service capture time, keeps `calculateAge()` defensive for already-loaded raw values, and adds migration `016-normalize-approximate-age-values.sql` so existing bad rows become true birth years and increment in future years. Existing correctly stored years such as 2016 are left unchanged because they are outside the age-like range.