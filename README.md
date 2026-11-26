[![make.fun](https://make.fun/badge/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6.svg)](https://make.fun/bounty/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6?utm_source=github&utm_medium=readme&utm_campaign=u-motasimfuad-the-self-checkout-is-judging-you-b71130d6)
[![rank](https://make.fun/badge/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6/qw123gyj-dev/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6/rank.svg)](https://make.fun/bounty/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-motasimfuad-the-self-checkout-is-judging-you-b71130d6)
[![reward](https://make.fun/badge/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6/qw123gyj-dev/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6/reward.svg)](https://make.fun/bounty/u-motasimfuad-the-self-checkout-is-judging-you-b71130d6?utm_source=github&utm_medium=readme&utm_campaign=u-motasimfuad-the-self-checkout-is-judging-you-b71130d6)

# The Self-Checkout Is Judging You

A make.fun entry: one funny line in the voice of a smug self-checkout machine, picked by a small deterministic scorer that reads the judge's brief and applies it in the brief's own order.

## The brief

Write a single funny remark from a judgmental self-checkout machine, at most 200 characters, the sort of line the till would say to a shopper buying twelve yoghurts and nothing else. The house judge compares entries two at a time and weighs them, most important first:

1. It is a funny single-line remark from a judgmental self-checkout machine.
2. It earns a real laugh on a single read, with a twist or a sting a stranger gets with no context.
3. It speaks in the machine's voice, smug and petty about what the shopper is buying and how they bag it.
4. It stays tight, with no setup padding and every word earning its place.
5. It feels fresh rather than a self-checkout joke everyone has already heard.

The gate is simple: the entry file must be UTF-8 text of 1 to 200 characters, not only whitespace, on a single line. Anything else never reaches the judge. Prizes go to the top ten entries, $2 in total, with $0.63 for first place.

## The winning line

> I have bagged your frozen pizza, your ice cream and your excuses. Only the excuses melted.

90 characters, one line. The scorer gives it 92.5 out of 100: full marks on laugh, pettiness, tightness and freshness, and 7 out of 10 on machine voice. The joke works because the till does its actual job — bagging — and bags something that is not food. The second sentence then reports which of the three items survived, and it is not the one the shopper would want kept.

The runner-up, at 80.5 points, is the till keeping notes on a third meal deal in one week:

> That is your third meal deal this week. I am a till, not a diary, but I am keeping notes.

The shortlist also contains a deliberate control: the famous bagging-area joke, which scores 38.5 with zero on freshness, exactly as the brief's fifth criterion intends. It is there to prove the scorer punishes staleness instead of rewarding it.

## How it works

`main.ts` holds 18 candidate one-liners, all written for this field, and scores each one on five marks of 0 to 10, in the brief's order:

- **Machine voice** — first-person till language: "I have bagged", "please", "your basket", "scanner", "beep", "receipt".
- **Laugh** — a setup, a turn ("but", "also", "only", "literally"), and a punch phrase landing in the last few words; a short closing sentence and a specific number help.
- **Petty** — naming the actual food in the basket, naming the bagging, and noticing what the shopper did.
- **Tight** — length in the 50–120 character sweet spot, no filler words, no sprawl.
- **Fresh** — starts at 10 and loses five points per stale template, so the bagging-area cliche scores zero.

The marks combine with weights that follow the brief's ordering (laugh 3.0, machine 2.5, petty 2.0, tight 1.5, fresh 1.0) into a total out of 100. Ties break to the shorter line, then to the earlier candidate, so the result is fully deterministic: same candidates, same winner, every run.

After picking the winner, the program writes it to `$MAKEFUN_OUTPUT_DIR/entry.txt` (or `/output/entry.txt` when that variable is unset), reads the file back, and verifies every gate itself — character count, single line, valid UTF-8, not only whitespace — before reporting success. Built-in self-checks also confirm every candidate passes the gate, the control line scores zero on freshness, and the winner clears 70 points.

## How to run

Requires Node 22. No dependencies, no network.

```sh
MAKEFUN_OUTPUT_DIR=/tmp/checkout-out node main.ts
cat /tmp/checkout-out/entry.txt
```

The program prints the full score table, the winner, and the gate verdict.

## Files

- `main.ts` — the candidates, the scorer, the gate verification, and the writer. The whole entry.
- `README.md` — this file.
- `LICENSE` — MIT.
- `.makefun/owner.json` — the entrant's wallet.
