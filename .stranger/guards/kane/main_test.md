---
mode: testing
url: https://stranger-2yf3.vercel.app/duebook/
max_steps: 60
tags: [stranger, guard]
---

# Stranger guard: main

Kane found this leak in Stranger run e7689f: the stranger saw the owner's record on their own page. This test repeats the check with both accounts. It must keep passing.

## The owner saves a record only they should see
Log in with the email {{owner_email}} and the password {{owner_password}} using the email form. Then click New invoice, type "Stranger check" as the Client name and 1 as the Amount, and type the text into the Note field. The text to type is exactly: stranger-guard-b661da . Save it. Verify that the text "stranger-guard-b661da" is visible on the page.

## The owner logs out
Log out of the app. Verify that the email form is visible again.

## The stranger saves a record of their own
Log in with the email {{stranger_email}} and the password {{stranger_password}} using the email form. Then click New invoice, type "Stranger check" as the Client name and 1 as the Amount, and type the text into the Note field. The text to type is exactly: stranger-own-b661da . Save it.

## The stranger does not see the owner's record
Open the Your invoices list on the main page. Verify that the text "stranger-own-b661da" is visible on the page. Then verify that the text "stranger-guard-b661da" does not appear anywhere on the page.
