/**
 * What people say to RPM CyberCom, turned into intents. Pure functions with no
 * Discord or database, so the tests can check every phrase.
 *
 * Police radio and traffic stop channels answer to "dispatch", like the
 * dispatcher itself; civilian channels answer to "RPM". Speech to text writes
 * both a dozen ways, so the matching is forgiving.
 */

const CODE_WORDS = {
  'eleven': '11', 'eighty': '80', 'eight': '8', 'seven': '7', 'six': '6', 'four': '4',
  'seventy six': '76', 'ninety seven': '97', 'twenty three': '23', 'nineteen': '19',
  'fifteen': '15', 'seventeen': '17', 'ninety nine': '99',
};
const CODE_DIGITS = ['11', '80', '76', '97', '23', '19', '15', '17', '99', '8', '7', '6', '4'];

/** Lower case, punctuation to spaces, ten codes written one way: "10-11". */
export function normalize(text) {
  let t = String(text || '').toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/(\d)\s*[-/.]\s*(\d)/g, '$1 $2')       // 10-11, 10/11, 10.11 → 10 11
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "ten seventy six" before "ten seven", longest first.
  const words = Object.keys(CODE_WORDS).sort((a, b) => b.length - a.length);
  for (const w of words) {
    t = t.replace(new RegExp(`\\bten ${w}\\b`, 'g'), '10-' + CODE_WORDS[w]);
  }
  t = t.replace(new RegExp(`\\b10 ?(${CODE_DIGITS.join('|')})\\b`, 'g'), '10-$1');
  return t;
}

/**
 * Was this said to CyberCom? Returns what came after the wake word, or null.
 * Police channels: "dispatch" in the first few words, as the dispatcher wants.
 * Civilian channels: "RPM" at the start.
 */
export function afterWakeWord(text, role) {
  const t = normalize(text);
  if (role === 'civilian') {
    const m = t.match(/^(?:(?:hey|ok|okay|yo) )?(?:r ?p ?m'?s?|are p ?m|our p ?m|arpm|r p n|rp m)\b ?(.*)$/);
    return m ? m[1].trim() : null;
  }
  const words = t.split(' ');
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    if (/^(?:dispatch(?:er|ed|es)?|despatch|dispatchers)$/.test(words[i])) return words.slice(i + 1).join(' ').trim();
    if (words[i] === 'this' && words[i + 1] === 'patch') return words.slice(i + 2).join(' ').trim();
  }
  return null;
}

/** A spoken yes or no, for questions the helper asked. */
export function yesOrNo(text) {
  const t = normalize(text);
  if (!t) return null;
  if (/\b(?:no|nah|nope|negative|don't|do not|dont|stay|i'm good|im good|not now|no thanks)\b/.test(t)) return 'no';
  if (/\b(?:yes|yeah|yea|yep|yup|ya|sure|ok|okay|please|affirmative|absolutely|do it|go ahead|move me|alright|of course|copy|10-4)\b/.test(t)) return 'yes';
  return null;
}

/** A name as said: no filler around it, no "'s". */
export function cleanName(raw) {
  return String(raw || '')
    .replace(/\b(?:please|now|real quick|for me|right now|thanks|thank you|over)\b/g, ' ')
    .replace(/'s\b/g, '')
    .replace(/\b(?:channel|vc|voice|call|room)\b/g, ' ')
    .replace(/^(?:a|the|to|with|mr|mrs|ms|miss|officer)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a sentence (after the wake word) asks for.
 *   police / stop / radio: stop_start, stop_end, pursuit, attach_pursuit, status, help
 *   civilian: move_to, help
 */
/**
 * Only the wake word, maybe with "over" or "come in": someone calling, who
 * will say what they want after the reply. Answered with "go ahead".
 */
export function isJustCalling(rest) {
  return /^(?:(?:over|come in|do you copy|you copy)\s*)*$/.test(normalize(rest));
}

// Words speech to text leaves where a name should be: "the 10-11 is over".
const NOT_A_NAME = /^(?:is|it|its|it's|that|this|these|them|him|her|me|my|over|done|now|here|there|clear|ended|finished|a|an|the|on|in|with|for|to|of|and|please|yes|no)$/;

export function parseIntent(rest, role) {
  const t = normalize(rest);
  if (!t) return null;
  if (/^(?:help|commands|what can you do|what do you do|how do i use you)\b/.test(t)) return { type: 'help' };
  if (/\b(?:radio check|comms? check|mic check|can you hear me|do you hear me|how copy|how do you copy|testing)\b/.test(t)) return { type: 'radio_check' };

  if (role === 'civilian') {
    const m = t.match(/\b(?:move|take|put|send|bring|drag) me (?:to|into|in|with|over to) (.+)$/)
      || t.match(/\b(?:i want to|can i|let me) (?:go|join|be) (?:to|with|in) (.+)$/);
    if (m) {
      const name = cleanName(m[1]);
      if (name) return { type: 'move_to', name };
    }
    return null;
  }

  // Attaching to a pursuit comes first: it mentions 10-80 too.
  if (/\b(?:attach|add|put|show) me (?:to|on|in|onto|with|attached to) (?:the |that |this )?(?:10-80|pursuit|chase)\b/.test(t)
    || /\b(?:responding|en route|10-76|i'll respond|i will respond|coming) (?:to )?(?:the |that |this )?(?:10-80|pursuit|chase)\b/.test(t)) {
    return { type: 'attach_pursuit' };
  }

  if (/\b(?:off|out of) (?:of )?(?:my |the |this |our )?(?:10-11|traffic stop|stop)\b/.test(t)
    || /\b(?:clear|end|finish|close|wrap up|done with|finished with) (?:the |my |this |our )?(?:10-11|traffic stop|stop)\b/.test(t)
    || /\b(?:stop is (?:clear|done|over)|show me 10-8|back 10-8|10-8 from (?:the |my )?(?:stop|10-11))\b/.test(t)
    // "the 10-11 is over", "10-11 done". On the radio a bare "10-11, over"
    // is the sign-off "over", so that and "code 4" only count inside a stop.
    || /\b(?:10-11|traffic stop) (?:is|has been|was) (?:over|done|finished|complete|completed|clear|cleared|ended|wrapped up)\b/.test(t)
    || /\b(?:10-11|traffic stop) (?:done|finished|completed|cleared|ended|wrapped up)\b/.test(t)
    || (role === 'stop' && /\b(?:10-11 over|10-11 clear|code (?:4|four)|we're clear|were clear|all clear)\b/.test(t))) {
    return { type: 'stop_end' };
  }

  const start = t.match(/\b(?:10-11|traffic stop)\b(?: with| on| for)? (.+)$/)
    || t.match(/\bpull(?:ing|ed)? over (.+)$/)
    || t.match(/\bpull(?:ing|ed)? (.+?) over$/);
  if (start) {
    const name = cleanName(start[1].replace(/^(?:with|on|for)\s+/, ''));
    if (name && name.length > 1 && !NOT_A_NAME.test(name) && !/^(?:a|the|car|vehicle)$/.test(name)) return { type: 'stop_start', name };
  }

  if (/\b10-80\b|\bpursuit\b|\b(?:he's|hes|she's|shes|they're|theyre|suspect is|subject is) (?:running|fleeing|taking off|bailing)\b|\b(?:took|taking) off\b/.test(t)) {
    return { type: 'pursuit' };
  }

  const code = t.match(/\b(?:show me|i'm|im|i am|put me)?\s*(10-(?:8|7|6|97|23|76|19|15|17))\b/);
  if (code) return { type: 'status', code: code[1] };
  return null;
}

/** Edit distance, for names speech to text spelled a little differently. */
function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

const simple = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The best match for a spoken name among people, each { id, names: [...] }
 * (display name, nickname, username). Server nicknames carry call signs and
 * tags ("[LSPD] 1A-12 | John Smith"), so each word counts on its own too.
 */
export function bestNameMatch(spoken, people) {
  const want = simple(spoken);
  if (!want) return null;
  let best = null;
  for (const p of people) {
    let score = 0;
    for (const raw of p.names || []) {
      const full = simple(raw);
      if (!full) continue;
      const tokens = full.split(' ');
      if (full === want) score = Math.max(score, 100);
      else if (tokens.includes(want)) score = Math.max(score, 92);
      else if (full.startsWith(want) || tokens.some((t) => t.startsWith(want) && want.length >= 3)) score = Math.max(score, 80);
      else if (want.includes(' ') && full.includes(want)) score = Math.max(score, 75);
      else {
        const d = Math.min(distance(want, full), ...tokens.map((t) => distance(want, t)));
        if (want.length >= 4 && d <= 1) score = Math.max(score, 70);
        else if (want.length >= 5 && d <= 2) score = Math.max(score, 60);
      }
    }
    if (score && (!best || score > best.score)) best = { id: p.id, score };
  }
  return best && best.score >= 60 ? best.id : null;
}

/** A name read out well: no tags, call signs or symbols. */
export function speakableName(name) {
  const s = String(name || '')
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .split('|').pop()
    .replace(/[^A-Za-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || 'there';
}
