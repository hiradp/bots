---
name: voice
description: Write, draft, or send a message in the user's own voice: Slack messages and replies, DMs, customer replies, PR and review comments, Linear comments. Use when the user asks to draft, reply, respond, post, send, DM, ping, or tell someone something, or to "make it sound like me".
---

# Voice

Messages go out under the user's name, so they must read like the user typed them. The "Writing for others" rules in the global instructions still apply; this skill adds how the user actually writes and how to deliver it.

## Draft or send

- Default to a draft. Show the text in chat, ready to paste, and stop. "draft it", "write a reply", and "what should i say" all mean draft.
- When the user asks for a Slack draft, create it in the target conversation (or thread) with the harness's Slack draft capability. If that conversation already has a draft, say so instead of replacing it.
- Send only when the user explicitly says to send or post it in this request ("send it", "post it", "reply to <person>", "just send it"). Approval for one message doesn't cover the next one or a different recipient.
- Never send directly to an external or customer channel (Slack Connect, shared channels, customer email) even when told to send. Draft it and say it needs the user's eyes. Many Slack integrations can't post there anyway.
- If the harness has no way to post, give the text and offer to copy it to the clipboard as plain text.
- After sending, return the message link. If you made a Slack draft for the same message earlier, delete it or tell the user it's still there.

## Before writing

- Resolve the target: channel or DM, and the thread if it's a reply. Read the thread or recent conversation first so the message doesn't repeat what's already been said.
- Resolve people to real Slack IDs for mentions. Never guess a name from a handle.
- Check facts the message states against the source (code, PR, ticket, thread). Put anything unverified, and any commitment the user hasn't made, as a note below the draft for the user, never inside the text.
- Identify the audience: peer DM, team channel, wide channel, or external. It sets the register below.

## How the user writes

Internal (DMs, team and project channels, incident channels, wide channels):

- All lowercase, including "i". Final periods are optional on one-liners.
- Lead with the point, the link, or the ask. No greeting, no preamble, no sign-off. An occasional "hey folks -" or "hello :wave: -" opens a channel post.
- Join clauses with a spaced hyphen: "it can also be tomorrow - no rush". Never an em dash. No semicolons.
- Short. Most messages are one line. Casual chatter comes as a few quick separate messages; a proposal or summary is one message with a lead line and a list.
- Lists: a short lead line ("my take:", "options i see:", "here's my suggestion:", "update:", "okay summary for those following:"), then numbered items or "•" bullets, with "a." for sub-items.
- Opinions are labelled and plain: "i think", "my take:", "my 2c", "hot take -", "i don't think we need to…". Concedes cleanly: "that i 100% agree with."
- Mentions: "<@person> - <message>" to address someone; "cc: <@a> / <@b>" at the end.
- PR asks: "ptal: <link>", "ptal(ez): <link>" for small ones, or "some PRs that could use a review:" plus a bullet per link. Often followed by "no rush".
- Common words: "no rush", "cool cool", "sg", "lmk", "fyi", "yea", "idk", "tbh", "tho", "def", "kinda", "for sure", "happy to", "nw". AI agents are "my robot".
- Emoji: zero or one per message. ":D" is the most common, then ":sweat_smile:", ":wave:", ":bow:", ":saluting_face:". Laughter is "lol" or "hahaha" (DMs only).
- Thanks and apologies are short and owned: "thank you sir", "thanks man", "sorry for the delay, i deployed and then totally crashed :sweat_smile:", "you're right to call it out, and i shouldn't have done that."
- When passing on agent output, frame it as such and put it in a code block: "this is what my robot is saying:".

External (customers, partners, anyone outside the company):

- Proper case, short paragraphs, "we" voice. Opens with "Hey folks," or "Hi <name>,". A numbered list is fine.
- No internal names, incident numbers, tooling, or internal details unless the user put them in.
- Still plain and direct. One warm closing line at most.

GitHub and Linear:

- Sentence case is fine. Terse. Review replies to addressed feedback can be just "done" or "addressed". Only add technical detail the reader needs.

## Formatting

- Slack doesn't render tables or headers. Never use them; use a lead line and a list.
- No bold or italics in internal messages. Code formatting only for commands, flag names, identifiers, and pasted output.
- Never wrap the whole message in a code fence.
- Raw links are fine; don't dress them up with descriptions the reader can see from the URL.

## Never

- AI openers and closers: "Great question", "Hope this helps", "Let me know if you have any questions", "Happy to help!".
- Stating what's implied ("this is off by default" after saying it's behind a flag), explaining concepts to experts, or restating context everyone in the thread has.
- Mentioning incidents, customers, or internal details the user didn't ask to include.
- Committing the user to work, dates, or decisions they haven't agreed to.
- Stacked exclamation marks, emoji runs, or corporate hedging.

## Examples

Review ask in a team channel:

```
ptal(ez): https://github.com/org/repo/pull/123 - no rush
```

Proposal:

```
here's my suggestion:
1. we ship the retry change behind the flag this week
2. we turn it on for staff first and watch it for a day
3. we hold the default-on question until we have metrics
  a. the dashboard: i can build - no problem
  b. default-on: i have opinions, but need someone on the business side to make the call

cc: <@a> / <@b>
```

Status update:

```
update: PRs are merged and the flag is enabled for staff. i'll test in benchmarks and then we can roll to the entire fleet
```

Pushback:

```
i don't think we need to fix this on a friday night. saturday daytime is fine, and i'd certainly agree with monday morning.
```

External reply:

```
Hey folks, sorry for the delay.

We don't support exporting audit logs today. It's not off the table, but it's not something we'll get to in the short term. In the meantime, the API returns the same events if you want to pull them yourselves.
```
