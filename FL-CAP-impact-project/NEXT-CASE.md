# Impact Project — how I add the next case

FlyRank AI Fluency capstone. Written 11 Oct 2026.

The point of this note is that the portfolio doesn't go stale. Adding a case should take an evening, not a rebuild. So: exactly where the next one goes, the steps, the named next piece, and the reminder I actually set.

## Where the next case goes

The cases live in one file: [`FL-W2-frame-it-as-cases/CASES.md`](../FL-W2-frame-it-as-cases/CASES.md) in this repo. Voice card at the top, cases 1–4, then **Bio**, **Contact**, **Before / after**.

A new case goes **after case 4 and before the `## Bio` heading**, numbered 5. Same shape as the others: a title, then three bold beats — **The problem.**, **What I did.**, **What came of it.** — with a **What didn't work.** paragraph between the second and third, and a `Code:` or `Live:` link line at the end. When the file gets to about eight cases I'll split it into one file per case, but not before; one file is easier to keep honest.

## The steps (what I do, in order)

1. Open a chat in my Claude Project for the internship. It already has the voice card, my stack, the bio and the four existing cases, so I don't re-explain anything.
2. Ask it to interview me, one question at a time, and answer in plain words: what problem it started from, what I actually did and decided, what I tried that didn't work, what the result was (even if small), what I'd do differently.
3. Ask for a draft in the three-beat shape, in my voice card: *plain, specific, honest about trade-offs, no hype.*
4. Read every line out loud. Cut anything I wouldn't say to someone's face or can't stand behind. If a line could sit on anyone's portfolio, it goes.
5. Paste it into `CASES.md` under case 4, add the link line, and commit and push under my own name:

   ```bash
   cd ~/Developer/FlyRank
   git add FL-W2-frame-it-as-cases/CASES.md
   git commit -m "Case 5: <short title>"
   git push
   ```

6. Once the portfolio is live (see below), the same text goes on the site; the markdown file stays the source of truth.

Time budget: one evening. If it's taking longer, the case is too big — split it.

## The next piece of work

**Case 5: putting the portfolio live on my own domain** — the FlyRank "Send the Link" capstone. Right now the cases are a markdown file on GitHub, which a hiring manager will not read. The next real piece of work is a one-page site on my domain with the voice card, the four cases, the bio and the one action (email me), plus the FlyRank badge in the footer. That build is itself a case: the problem is "nobody reads a markdown file", the decisions are the stack and hosting, and what comes of it is a link I can send.

Target: start by **Sat 18 Oct 2026**.

## The reminder (evidence)

I set a scheduled task on my Claude account that fires on **Sat 18 Oct 2026 at 10:00 (Dubai)** with a push notification and an email. The task's prompt contains the five steps above and the named next piece, so when it fires I get the instructions, not just a nudge.

- Task name: *Add next portfolio case (FlyRank)*
- Task id: `trig_019FygqATFVV9RU8fuPzefgE`
- Fires once: 2026-10-18 06:00 UTC (10:00 Dubai), notifications: push + email

The task as listed on my account, with the exact text it sends: [`reminder.md`](reminder.md).

## The build context is kept

Everything was built inside a Claude Project called *Flyrank Internship*. It holds the notes for each assignment (stack choices, what broke, how it was tested), the voice card and bio from Week 2, and the repo layout decisions (one repo, one folder per assignment; capstones in `flyrank-capstones`). The next case is a conversation in that Project, not a fresh start.
