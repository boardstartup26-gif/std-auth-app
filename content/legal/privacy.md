# Privacy Policy

<!--
  Editing notes
  - The page title, version and "Last updated" date are NOT set here. They live
    in src/lib/legal/policies.ts. Bump the version there whenever a change
    would need users to agree again; signups are recorded against it.
  - Supported markdown: ## and ### headings, paragraphs, - lists, 1. lists,
    > callouts, | tables |, **bold**, [links](/path). Nothing else is rendered.
  - HTML comments like this one are stripped and never shown on the page.
  - Keep this text in step with what the code actually does. The data audit
    behind version 1.0 covered: Supabase auth + profiles, student_answers,
    evaluations, usage, usage_feedback, analytics_events (+ browser storage in
    src/lib/analytics/track.ts), policy_consents, and the Anthropic call in
    src/app/api/evaluate/route.ts. Adding a new data flow means updating this.
-->

> **In short:** BoardEdge collects what it needs to run your account and grade your answers — your name, email, the answers you submit, and basic usage information. If you're under 18, our standard process is to not grade anything until a parent or guardian confirms consent by email — see the notice below for a short exception currently in effect. We don't sell your data or show you ads. Answers to written questions are sent to our AI provider, Anthropic, to be graded, without your name or email attached. You can delete your account, and your answers with it, at any time.

## Who we are

BoardEdge ("BoardEdge", "we", "us") is an online practice platform that grades answers to ICSE (CISCE) Class 9 and 10 past-paper questions against their official marking schemes. For the purposes of India's Digital Personal Data Protection Act, 2023 ("DPDP Act"), BoardEdge is the **Data Fiduciary** for the personal data described in this policy.

You can reach us about anything in this policy at [contact.boardedge@gmail.com](mailto:contact.boardedge@gmail.com).

## Students under 18

Most people who use BoardEdge are school students under 18. Under the DPDP Act, a person under 18 is a child, and we need the verifiable consent of their parent or lawful guardian to process their personal data.

### How we verify consent

1. When a student signs up (or, for accounts created before this process existed, the next time they log in), they give us their parent's or guardian's email address.
2. We email that address a personal confirmation link, valid for 72 hours. The link opens a page explaining what BoardEdge is and what data we process, and the parent or guardian confirms by pressing a button.
3. **Until a parent or guardian confirms, the student's answers are not graded.** An unconfirmed account can log in and see its dashboard and past results, but any new answer is refused before it is stored or sent to our AI provider.
4. We keep the parent's or guardian's email address, when the link was sent, and when consent was confirmed, as a record of consent.

> **Temporary notice, added 18 September 2026:** While we finish setting up reliable delivery for the confirmation email in step 2, step 3 above is not currently being enforced — a student's answers may be graded before a parent or guardian has confirmed. We are still asking for the parent or guardian email at signup and still attempting to send the confirmation link; a parent or guardian who withdraws consent (see below) is honoured immediately regardless of this notice. We expect this exception to last only a few days and will remove this notice once grading is gated on confirmation again, as described above.

### Withdrawing consent

A parent or guardian can withdraw consent at any time by emailing [contact.boardedge@gmail.com](mailto:contact.boardedge@gmail.com) **from the email address that gave consent**, with "Withdraw consent" in the subject line. We will reply to that address to confirm the request. Once withdrawn, grading is paused on the account straight away, and the student cannot send a new consent link themselves. Past results remain available unless you also ask us to delete the account, which we will do on request. At this stage withdrawals are handled by our team by hand, normally within 3 working days.

### Other protections

- We do not track children across other websites, show them behavioural or targeted advertising, or build profiles of them for any purpose other than showing them their own progress.
- A parent or guardian can contact us at any time to see, correct, or delete their child's data. We may ask for reasonable information to confirm the request comes from the child's parent or guardian.

## What we collect

### Information you give us

- **Account details** — your first name, last name, email address, and a password. Passwords are stored only as a secure hash by our authentication provider; we never see them.
- **Google sign-in** — if you choose "Continue with Google", Google shares your name, email address, profile picture link, and a Google account identifier with us. We don't receive your Google password or access to your Google Drive, Gmail, or contacts.
- **Your answers** — the text you type in response to questions, and the question you answered.
- **Feedback** — anything you write to us through the in-app feedback form, and any rating or tags you choose.
- **Parent or guardian email** — the address a student gives us so we can ask for parental consent. We use it only to send the consent link and to handle consent or data requests from that parent or guardian.

### Information created when you use BoardEdge

- **Evaluation results** — the marks awarded, points you hit and missed, examiner-style feedback, the model answer, and improvement tips for each answer.
- **Credit usage** — how many evaluation credits you used on each day, so we can apply the weekly free limit.
- **Your consent record** — which version of this policy and the Terms you agreed to, how (email signup or Google), and when.
- **Parental consent record** — whether a parent or guardian has confirmed, withdrawn, or not yet responded, when consent links were sent, and when consent was confirmed or withdrawn.

### Information collected automatically

- **Product usage events** — pages you visit on BoardEdge, and steps such as selecting a question, starting to type, submitting, and whether an evaluation succeeded or failed. We use these to understand where the product works and where it breaks.
- **Visit identifiers** — a random visitor ID and a random per-visit session ID generated in your browser. They are not derived from your name, email or device and don't identify you on other websites.
- **How you found us** — the website that referred you and any campaign tags (such as utm_source) in the link you first arrived from.
- **Technical data** — your IP address and browser type are processed by our hosting and authentication providers to deliver the service, keep sessions secure, and prevent abuse. Our own analytics do not store your IP address.

We do **not** collect your phone number, school, address, date of birth, payment details, precise location, contacts, or photos.

## Why we use it

| Purpose | Data used | Legal basis |
|---|---|---|
| Creating and securing your account | Name, email, password hash, Google profile, session data | Your consent (and your parent's or guardian's, if you are under 18) |
| Grading your answers | Your answer, the question, its marking scheme | Your consent |
| Showing your history and progress | Answers, evaluation results | Your consent |
| Applying the free weekly credit limit | Credit usage | Your consent |
| Fixing bugs and improving BoardEdge | Usage events, feedback, error logs | Your consent |
| Keeping BoardEdge safe and preventing abuse | IP address (transiently), usage events | Legitimate use permitted under the DPDP Act |
| Proving what you agreed to | Consent record | Compliance with law |
| Getting and recording parental consent | Parent or guardian email, parental consent record | Compliance with law (DPDP Act, section 9) |

We do not sell your personal data, rent it, or use it for advertising. We do not use your answers to train AI models, and our AI provider does not use them to train its models either (see below).

## AI grading and Anthropic

When you submit an answer to a written (subjective) question, we send **the question, your answer, and the official marking scheme** to Anthropic, PBC, which provides the Claude AI model that grades it. We do **not** send your name, email address, or account ID.

Anthropic processes this data on our behalf under its commercial terms, which do not permit it to use our API inputs or outputs to train its models. Anthropic may keep API data for a limited period for trust-and-safety purposes, as described in its own policies.

Objective questions (such as multiple choice) are marked directly by BoardEdge and are not sent to Anthropic.

Please don't write personal information — your full name, phone number, address, or anything about other people — in your answers. Your answers only need to contain the answer.

## Who we share data with

We share personal data only with service providers who help us run BoardEdge, and only what each one needs:

| Provider | What they do | Data involved |
|---|---|---|
| **Supabase** | Database, authentication, and account storage | All account data, answers, results, usage, feedback, analytics events, consent records |
| **Resend** | Sending consent emails to parents and guardians | Parent or guardian email address, the student's first name, the consent link |
| **Anthropic** | AI grading of written answers | Question, answer text, marking scheme — no identity |
| **Google** | Optional "Continue with Google" sign-in | The sign-in exchange you approve on Google's screen |
| **Vercel** | Website hosting | Web requests, including IP address and browser type, in server logs |

These providers may process data outside India, including in the United States. We will only transfer data to countries that are not restricted by the Government of India under the DPDP Act.

We may also disclose data if the law requires it — for example, to comply with a valid order from a court or government authority — or to protect the safety of our users.

## Cookies and browser storage

BoardEdge does not use advertising or third-party tracking cookies. We use:

| Name | Type | Purpose | Lasts |
|---|---|---|---|
| sb-…-auth-token | Cookie | Keeps you signed in (strictly necessary) | Until you sign out or the session expires |
| be_anon_id | Cookie and local storage | Random visitor ID for product analytics | Cookie: 1 year. Local storage: until cleared |
| be_attribution | Local storage | The referring site and campaign tags from your first visit | Until cleared |
| be_first_touch_sent | Local storage | Remembers we've already counted your first visit | Until cleared |
| be_session_id, be_session_touched_at | Session storage | Groups page views into a single visit | Until the tab is closed |

You can clear these at any time in your browser settings. If you block cookies, you won't be able to stay signed in.

## How long we keep it

- **Account, answers, results, credit usage, feedback, consent records and the parent or guardian email** — kept for as long as the account exists, and deleted when the account is deleted.
- **Product usage events** — when you delete your account, events are unlinked from your account and kept only in pseudonymous form (tied to a random visitor ID, not to your name or email) so our overall usage figures stay accurate.
- **Server and authentication logs** — kept by our providers for their standard, limited log-retention periods.
- **Data held by Anthropic** — handled under Anthropic's retention policy for API data, as described above.

## Your rights

Under the DPDP Act, you (or your parent or guardian, if you are under 18) have the right to:

1. **Access** — ask what personal data we hold about you and how we use it.
2. **Correction and completion** — ask us to fix inaccurate or incomplete data.
3. **Erasure** — delete your account yourself from the Account page, which removes your profile, answers, results and usage; or ask us to do it.
4. **Withdraw consent** — at any time. For students under 18, a parent or guardian withdraws consent as described in [Withdrawing consent](#withdrawing-consent); grading is paused straight away. Withdrawing does not affect processing already carried out.
5. **Grievance redressal** — raise a complaint with us, and if you're not satisfied with our response, with the Data Protection Board of India.
6. **Nominate** — nominate someone to exercise these rights on your behalf in the event of death or incapacity.

To exercise any of these rights, email [contact.boardedge@gmail.com](mailto:contact.boardedge@gmail.com) from the email address on your account. We aim to respond within 30 days.

## Security

Your data is encrypted in transit (HTTPS) and stored with our database provider, which encrypts data at rest. Database access is restricted by row-level security so each account can only read its own records, and administrative access is limited to a small number of authorised people. No system is perfectly secure; if a breach affects your personal data, we will notify you and the Data Protection Board of India as the DPDP Act requires.

## Changes to this policy

When we change this policy, we'll update the version number and "Last updated" date at the top of this page. If the change is significant, we'll tell you in the app or by email, and where the law requires it, we'll ask for your consent again before the change applies to you.

## Contact and grievances

For questions, requests or complaints about your personal data, write to our Grievance Officer at [contact.boardedge@gmail.com](mailto:contact.boardedge@gmail.com). Please include "Privacy" in the subject line.
