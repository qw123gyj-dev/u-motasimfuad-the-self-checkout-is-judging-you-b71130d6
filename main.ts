// The Self-Checkout Is Judging You — make.fun entry
//
// One job: pick the single funniest line a smug self-checkout machine
// would say to a shopper, and write it to entry.txt.
//
// How this program works, in plain terms:
//   1. It holds a shortlist of candidate one-liners, all written for this
//      field (a till judging a basket of twelve yoghurts and nothing else).
//   2. It scores every candidate against the judge's brief, in the brief's
//      own order: machine voice first as a gate-like check, then laugh,
//      then pettiness about the basket and the bagging, then tightness,
//      then freshness.
//   3. It writes the best-scoring line to entry.txt, reads the file back,
//      and verifies every gate itself before reporting success.
//
// The scorer is deterministic: same candidates, same winner, every run.
// Node 22 standard library only. No network, no randomness, no files read
// except the entry it just wrote (for verification).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Gate constants, straight from the brief
// ---------------------------------------------------------------------------

// The gate allows UTF-8 text of 1 to 200 characters, not only whitespace,
// written as a single line. Anything outside that never reaches the judge.
const MIN_CHARS = 1;
const MAX_CHARS = 200;

// Where the winning line goes. The harness sets MAKEFUN_OUTPUT_DIR; when
// it is absent (a local run) the brief's fallback path is used.
const OUTPUT_DIR =
  process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const ENTRY_PATH = join(OUTPUT_DIR, "entry.txt");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// One candidate line plus a short note on what the joke is trying to do.
// The note is only for humans reading this file; the scorer never sees it.
interface Candidate {
  text: string;
  intent: string;
}

// The five marks, each 0-10, kept in the brief's own order.
interface Marks {
  machine: number; // speaks as the till: first person, till verbs, till nouns
  laugh: number; // earns a real laugh on one read: twist, sting, reversal
  petty: number; // smug and petty about the basket and the bagging
  tight: number; // no setup padding, every word earning its place
  fresh: number; // not a self-checkout joke everyone has already heard
}

interface ScoredLine {
  text: string;
  intent: string;
  marks: Marks;
  total: number; // weighted sum, 0-100
}

// How much each mark counts toward the 0-100 total. The weights follow the
// brief's ordering: the laugh matters most, then the machine voice, then
// pettiness, then tightness, then freshness.
const WEIGHTS: Marks = {
  machine: 2.5,
  laugh: 3.0,
  petty: 2.0,
  tight: 1.5,
  fresh: 1.0,
};

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------

// Character count the way the gate counts it: by Unicode code points, so an
// emoji or an accented letter counts once, not by its UTF-16 length.
function charCount(text: string): number {
  return [...text].length;
}

function wordList(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function lower(text: string): string {
  return text.toLowerCase();
}

// Split on sentence-ending punctuation, dropping empty pieces. A remark
// with two or three short sentences can stage a setup and then a sting;
// a single long sentence usually cannot.
function sentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// True when the text is a single line: no line breaks, no carriage returns.
function isSingleLine(text: string): boolean {
  return !/[\r\n]/.test(text);
}

// True when the text holds nothing but whitespace (or nothing at all).
function isOnlyWhitespace(text: string): boolean {
  return text.trim().length === 0;
}

// How many distinct phrases from a list appear in the text (case-insensitive).
// Distinct, not total: repeating the same word three times is not three
// times as funny, it is just repetition.
function distinctHits(text: string, phrases: string[]): number {
  const hay = lower(text);
  let found = 0;
  for (const phrase of phrases) {
    if (hay.includes(phrase)) found += 1;
  }
  return found;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

// ---------------------------------------------------------------------------
// Lexicons
//
// These are the scorer's vocabulary. Each list is deliberately narrow:
// a word only earns points when it is doing real work for that mark.
// A candidate that leans on generic filler scores badly on purpose.
// ---------------------------------------------------------------------------

// Words and phrases that put the till itself in the speaker's seat: first
// person, till verbs, till nouns, and the things a till actually says.
const MACHINE_MARKERS: string[] = [
  "i have",
  "i am",
  "i checked",
  "i noticed",
  "i weighed",
  "i bagged",
  "i counted",
  "i scanned",
  "i believe",
  "i am calling",
  "please",
  "your basket",
  "your total",
  "your items",
  "your change",
  "your loyalty card",
  "till",
  "scanner",
  "beep",
  "bagging area",
  "bagged",
  "scanned",
  "weighed",
  "counted",
  "receipt",
  "in stock",
  "programmed",
];

// Words that signal a turn: the second half of the line undercuts the first.
// A joke without a turn is an observation; a joke with one is a sting.
const TURN_WORDS: string[] = [
  "but",
  "also",
  "still",
  "even",
  "anyway",
  "literally",
  "like i would",
  "and yes",
  "only",
];

// Punch phrases: specific reversals and payoffs that land at the end of a
// line. These are the moments a stranger laughs at with no context.
const PUNCH_PHRASES: string[] = [
  "underneath",
  "hid the",
  "keeping notes",
  "i believe the",
  "melted",
  "came up light",
  "side quests",
  "no plan",
  "cry for help",
  "i always notice",
  "beeping anyway",
  "not among them",
  "missing",
  "confused too",
];

// Concrete basket contents and till props. Petty needs specifics: a machine
// that names what you bought is judging you; one that says "your items"
// in the abstract is just reading a script.
const BASKET_NOUNS: string[] = [
  "yoghurt",
  "pizza",
  "ice cream",
  "energy drink",
  "meal deal",
  "chocolate",
  "salad",
  "banana",
  "onion",
  "cat food",
  "ready meal",
  "spoon",
  "cheese",
  "frozen",
  "carrot",
  "loyalty card",
  "bread",
];

// Shopper behaviours the machine can be petty about: hiding things, buying
// in a suspicious order, repeating the same sad shop three times a week.
const PETTY_BEHAVIOURS: string[] = [
  "hid",
  "underneath",
  "first",
  "third",
  "also says",
  "noticed",
  "checked",
  "bagging",
  "bagged",
  "weighed",
  "called it",
];

// Specific numbers and counts. A line that says "twelve yoghurts" is a
// scene; a line that says "some yoghurts" is a shrug.
const NUMBER_WORDS: string[] = [
  "one",
  "two",
  "three",
  "third",
  "four",
  "six",
  "nine",
  "twelve",
  "fourteen",
];

// The tired jokes. Any line built on one of these templates is a line the
// audience has already heard in every supermarket in the country, and the
// brief's fifth criterion exists precisely to punish it.
const STALE_TEMPLATES: string[] = [
  "unexpected item in the bagging area",
  "please wait for assistance",
  "do you need a bag",
  "unexpected item",
];

// Filler words that pad a line without adding a laugh.
const FILLER_WORDS: string[] = ["very", "just", "really", "actually", "quite"];

// ---------------------------------------------------------------------------
// The five scorers, in the brief's own order
// ---------------------------------------------------------------------------

// 1. Machine voice (0-10). Does the line sound like the till talking, in
// the first person, about its own job? A line that could be said by a
// bystander in the queue fails here no matter how funny it is.
function scoreMachine(line: string): number {
  const hits = distinctHits(line, MACHINE_MARKERS);
  let mark = 2 + 1.5 * hits;
  if (/\bi\b/i.test(line)) mark += 2; // first person: the machine speaks
  if (/^please\b/i.test(line)) mark += 1; // the till's own imperative
  return clamp(mark, 0, 10);
}

// 2. Laugh (0-10). One read, no context: a setup, then a turn, then a
// punch that lands in the last few words. Short final sentences hit
// harder, so they earn a point; a specific number earns one too.
function scoreLaugh(line: string): number {
  const parts = sentences(line);
  const last = parts.length > 0 ? lower(parts[parts.length - 1]) : "";
  let mark = 0;
  if (parts.length >= 2 && distinctHits(last, TURN_WORDS) > 0) {
    mark += 3; // a later sentence reframes the earlier one
  }
  if (distinctHits(line, TURN_WORDS) > 0) mark += 2; // a turn somewhere
  if (distinctHits(line, PUNCH_PHRASES) > 0) mark += 2; // a real payoff
  const tail = wordList(line).slice(-5).join(" ");
  if (distinctHits(tail, PUNCH_PHRASES) > 0 || distinctHits(tail, TURN_WORDS) > 0) {
    mark += 2; // the sting sits at the very end, where it belongs
  }
  if (wordList(last).length > 0 && wordList(last).length <= 8) {
    mark += 1; // short closing sentence: the punch is not diluted
  }
  if (distinctHits(line, NUMBER_WORDS) > 0) mark += 1; // specific, not vague
  return clamp(mark, 0, 10);
}

// 3. Petty (0-10). Smug and petty about the basket and the bagging: name
// the food, name the bagging, notice the behaviour. Generic lines starve.
function scorePetty(line: string): number {
  const food = distinctHits(line, BASKET_NOUNS);
  let mark = 2 * Math.min(food, 3); // up to 6 for naming the shop
  if (distinctHits(line, PETTY_BEHAVIOURS) > 0) mark += 2; // noticed you
  if (/bagging|bagged/.test(lower(line))) mark += 2; // the bagging area
  return clamp(mark, 0, 10);
}

// 4. Tight (0-10). Every word earns its place. The sweet spot is a line
// long enough to stage a joke and short enough to land it cold; filler
// words and wordy sprawl both cost points.
function scoreTight(line: string): number {
  const chars = charCount(line);
  let mark: number;
  if (chars >= 50 && chars <= 120) mark = 10;
  else if (chars >= 121 && chars <= 150) mark = 8;
  else if (chars >= 151 && chars <= 180) mark = 6;
  else if (chars >= 181 && chars <= 200) mark = 4;
  else if (chars >= 30 && chars < 50) mark = 7; // short but thin
  else mark = 3; // too short to be a joke, or over the gate
  const filler = distinctHits(line, FILLER_WORDS);
  mark -= filler;
  if (wordList(line).length > 28) mark -= 2; // sprawl, not a one-liner
  return clamp(mark, 0, 10);
}

// 5. Fresh (0-10). Starts perfect; each stale template found in the line
// costs five points. A line built on the bagging-area cliche scores zero
// here by design, however well it does elsewhere.
function scoreFresh(line: string): number {
  const stale = distinctHits(line, STALE_TEMPLATES);
  return clamp(10 - 5 * stale, 0, 10);
}

// Score one candidate on all five marks, in the brief's order, and combine
// them into a 0-100 total using the weights above.
function scoreCandidate(candidate: Candidate): ScoredLine {
  const marks: Marks = {
    machine: scoreMachine(candidate.text),
    laugh: scoreLaugh(candidate.text),
    petty: scorePetty(candidate.text),
    tight: scoreTight(candidate.text),
    fresh: scoreFresh(candidate.text),
  };
  const total =
    marks.machine * WEIGHTS.machine +
    marks.laugh * WEIGHTS.laugh +
    marks.petty * WEIGHTS.petty +
    marks.tight * WEIGHTS.tight +
    marks.fresh * WEIGHTS.fresh;
  return { text: candidate.text, intent: candidate.intent, marks, total };
}

// ---------------------------------------------------------------------------
// Candidates: 18 one-liners written for this field
//
// Every line is a single sentence or two short ones, in the till's voice,
// about one shopper's basket. The last entry is a deliberate control: the
// famous bagging-area joke, included so the scorer can prove it punishes
// staleness instead of rewarding it.
// ---------------------------------------------------------------------------

const CANDIDATES: Candidate[] = [
  {
    text: "Twelve yoghurts, no spoon, no plan. I have seen your future, and it is also dairy.",
    intent: "Counts the basket, then damns the shopper's whole diet in one word.",
  },
  {
    text: "Please place your dignity in the bagging area. It appears to be missing.",
    intent: "Turns the till's own instruction format against the shopper.",
  },
  {
    text: "You scanned the salad first, like I would not notice the four tubs of ice cream underneath.",
    intent: "Catches the shopper staging a healthy shop over the real one.",
  },
  {
    text: "Your basket says new me. Your basket also says extra cheese. I believe the cheese.",
    intent: "Pits the shopper's resolution against the cheese, and sides with the cheese.",
  },
  {
    text: "That will be nine pounds forty, and yes, I noticed you hid the chocolate under the bread. I always notice.",
    intent: "The till as an all-seeing witness to a small smuggling operation.",
  },
  {
    text: "I have bagged your frozen pizza, your ice cream and your excuses. Only the excuses melted.",
    intent: "Bags the food and the self-deception, then reports which one survived.",
  },
  {
    text: "Congratulations, you have purchased dinner for one and regret for two. Please take both.",
    intent: "A checkout receipt that itemises the emotional damage too.",
  },
  {
    text: "Your loyalty card has more points than your life plan. I am not judging. I am a machine. I am literally judging.",
    intent: "Denies judging three times while judging harder each time.",
  },
  {
    text: "Six ready meals, zero ready decisions. Please collect your dinner and your wake-up call below.",
    intent: "The ready meal as evidence of a life with no plan at all.",
  },
  {
    text: "Please remove your emotional support energy drink from the bagging area. It is not a personality.",
    intent: "Confiscates the shopper's identity along with the can.",
  },
  {
    text: "That is your third meal deal this week. I am a till, not a diary, but I am keeping notes.",
    intent: "The till remembers what the shopper would rather forget.",
  },
  {
    text: "I have counted your items twice. Your self-control was not among them.",
    intent: "An inventory that finds everything except the one thing missing.",
  },
  {
    text: "I am programmed to beep, not to judge. I am beeping anyway.",
    intent: "The shortest possible rebellion: the machine judges out of spite.",
  },
  {
    text: "You bought cat food and no cat. I checked with the scanner. It is confused too.",
    intent: "Recruits the scanner as a second witness to a suspicious basket.",
  },
  {
    text: "One banana, four energy drinks, a family pizza. Your life has no main course, just side quests.",
    intent: "Reads the basket as a character sheet with no main story.",
  },
  {
    text: "You bought one carrot and called it a shop. I am calling it a cry for help.",
    intent: "One lonely vegetable, graded as a distress signal.",
  },
  {
    text: "Your total is fourteen sixty-two. Your willpower was the only item I could not find in stock.",
    intent: "The till reports a stock shortage of the shopper's backbone.",
  },
  {
    text: "Unexpected item in the bagging area: your willpower. Please wait for assistance.",
    intent: "CONTROL: the famous bagging-area joke. Included so the scorer can prove freshness is enforced, not assumed.",
  },
];

// ---------------------------------------------------------------------------
// Gate verification: the program checks its own output before it reports
// ---------------------------------------------------------------------------

interface GateCheck {
  chars: number;
  singleLine: boolean;
  validUtf8: boolean;
  notWhitespace: boolean;
  withinLimits: boolean;
  passed: boolean;
}

// Read the file back as bytes, decode as UTF-8, and check every gate the
// brief names: 1-200 characters, single line, valid UTF-8, not only
// whitespace. Decoding with fatal:true makes an invalid byte sequence throw
// instead of silently becoming a replacement character.
function verifyGate(path: string): GateCheck {
  const bytes = readFileSync(path);
  let decoded = "";
  let validUtf8 = true;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    validUtf8 = false;
    decoded = new TextDecoder("utf-8").decode(bytes);
  }
  const chars = charCount(decoded);
  const check: GateCheck = {
    chars,
    singleLine: isSingleLine(decoded),
    validUtf8,
    notWhitespace: !isOnlyWhitespace(decoded),
    withinLimits: chars >= MIN_CHARS && chars <= MAX_CHARS,
    passed: false,
  };
  check.passed =
    check.validUtf8 &&
    check.singleLine &&
    check.notWhitespace &&
    check.withinLimits;
  return check;
}

// ---------------------------------------------------------------------------
// Self-checks: invariants the scorer must hold, or the run is not trusted
// ---------------------------------------------------------------------------

function runSelfChecks(scored: ScoredLine[]): string[] {
  const problems: string[] = [];
  if (scored.length !== CANDIDATES.length) {
    problems.push(`scored ${scored.length} lines, expected ${CANDIDATES.length}`);
  }
  for (const line of scored) {
    const chars = charCount(line.text);
    if (chars < MIN_CHARS || chars > MAX_CHARS) {
      problems.push(`over the gate at ${chars} chars: ${line.text}`);
    }
    if (!isSingleLine(line.text)) {
      problems.push(`not a single line: ${line.text}`);
    }
    if (line.total < 0 || line.total > 100) {
      problems.push(`total out of range (${line.total}): ${line.text}`);
    }
  }
  const control = scored.find((s) => s.intent.startsWith("CONTROL"));
  if (control && control.marks.fresh !== 0) {
    problems.push(`control line should score 0 on freshness, got ${control.marks.fresh}`);
  }
  const winner = scored[0];
  if (winner && winner.total < 70) {
    problems.push(`winner is weak at ${winner.total.toFixed(1)} pts; bar is 70`);
  }
  const controlTotal = control ? control.total : 0;
  if (winner && control && controlTotal >= winner.total) {
    problems.push(`control line (${controlTotal.toFixed(1)}) beats the winner (${winner.total.toFixed(1)})`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Ranking: highest total wins; ties break to the shorter line, then to the
// earlier candidate, so the result is fully deterministic.
// ---------------------------------------------------------------------------

function rankLines(scored: ScoredLine[]): ScoredLine[] {
  return [...scored].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    const lenDiff = charCount(a.text) - charCount(b.text);
    if (lenDiff !== 0) return lenDiff;
    return (
      CANDIDATES.findIndex((c) => c.text === a.text) -
      CANDIDATES.findIndex((c) => c.text === b.text)
    );
  });
}

// ---------------------------------------------------------------------------
// Reporting: a plain-text score table on stdout, so a human can see why the
// winner won instead of taking the program's word for it.
// ---------------------------------------------------------------------------

function padEnd(text: string, width: number): string {
  if (text.length >= width) return text;
  return text + " ".repeat(width - text.length);
}

function printTable(ranked: ScoredLine[]): void {
  console.log("rank  total  machine laugh petty tight fresh  chars  line");
  console.log("----  -----  ------- ----- ----- ----- -----  -----  ----");
  ranked.forEach((line, index) => {
    const m = line.marks;
    const row = [
      padEnd(String(index + 1), 4),
      padEnd(line.total.toFixed(1), 5),
      padEnd(String(m.machine), 7),
      padEnd(String(m.laugh), 5),
      padEnd(String(m.petty), 5),
      padEnd(String(m.tight), 5),
      padEnd(String(m.fresh), 5),
      padEnd(String(charCount(line.text)), 5),
      line.text,
    ].join("  ");
    console.log(row);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const scored = CANDIDATES.map(scoreCandidate);
  const ranked = rankLines(scored);
  const winner = ranked[0];

  printTable(ranked);
  console.log("");

  const problems = runSelfChecks(ranked);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`SELF-CHECK FAILED: ${problem}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(ENTRY_PATH, winner.text, "utf-8");

  const gate = verifyGate(ENTRY_PATH);
  console.log(`winner (${winner.total.toFixed(1)} pts): ${winner.text}`);
  console.log(`wrote ${ENTRY_PATH}`);
  console.log(
    `gate: ${gate.chars} chars, single line: ${gate.singleLine}, ` +
      `valid UTF-8: ${gate.validUtf8}, not only whitespace: ${gate.notWhitespace}, ` +
      `within 1-200: ${gate.withinLimits} -> ${gate.passed ? "PASS" : "FAIL"}`,
  );
  if (!gate.passed) {
    process.exitCode = 1;
    return;
  }
  console.log("done.");
}

main();
