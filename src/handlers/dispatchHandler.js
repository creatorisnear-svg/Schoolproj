import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import DispatchConfig from '../models/DispatchConfig.js';
import OfficerStatus from '../models/OfficerStatus.js';
import CADConfig from '../models/CADConfig.js';
import EmergencyCall from '../models/EmergencyCall.js';
import CADCharacter from '../models/CADCharacter.js';
import BOLO from '../models/BOLO.js';
import { errorEmbed } from '../utils/embedBuilder.js';

const TEN_CODES = {
  '10-4': { label: '10-4 Acknowledged', action: null },
  '10-6': { label: '10-6 Busy', action: null },
  '10-7': { label: '10-7 Out of Service', action: 'out_of_service' },
  '10-8': { label: '10-8 Available', action: 'available' },
  '10-11': { label: '10-11 Traffic Stop', action: 'traffic_stop' },
  '10-15': { label: '10-15 Prisoner in Custody', action: null },
  '10-20': { label: '10-20 Location', action: null },
  '10-78': { label: '10-78 Need Assistance', action: null },
  '10-80': { label: '10-80 Pursuit', action: null },
  '10-97': { label: '10-97 On Scene', action: null },
  '10-99': { label: '10-99 Officer Down', action: null },
};

/**
 * Returns an AI client + provider info.
 * Prefers GROQ_API_KEY (free). Falls back to OPENAI_API_KEY (paid).
 */
let groqKeys = [];
let currentGroqKeyIndex = 0;
let groqKeysLoaded = false;

function loadGroqKeys() {
  const keys = [];
  const primary = process.env.GROQ_API_KEY;
  if (primary) keys.push(primary);
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  const unique = [...new Set(keys)];
  if (unique.length !== groqKeys.length || unique.some((k, i) => k !== groqKeys[i])) {
    groqKeys = unique;
    if (currentGroqKeyIndex >= groqKeys.length) currentGroqKeyIndex = 0;
  }
  groqKeysLoaded = true;
  return groqKeys;
}

function rotateGroqKey() {
  if (groqKeys.length <= 1) return false;
  const prev = currentGroqKeyIndex;
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % groqKeys.length;
  console.log(`[AI] Rotated Groq key: slot ${prev + 1} → slot ${currentGroqKeyIndex + 1} (of ${groqKeys.length})`);
  return true;
}

function getAIClient() {
  if (!groqKeysLoaded) loadGroqKeys();
  const openaiKey = process.env.OPENAI_API_KEY;
  if (groqKeys.length > 0) {
    const key = groqKeys[currentGroqKeyIndex];
    return {
      client: new OpenAI({ apiKey: key, baseURL: 'https://api.groq.com/openai/v1' }),
      provider: 'groq',
    };
  }
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      provider: 'openai',
    };
  }
  throw new Error('No AI API key configured. Set GROQ_API_KEY (free) or OPENAI_API_KEY.');
}

function hasAIKey() {
  if (!groqKeysLoaded) loadGroqKeys();
  return !!(groqKeys.length > 0 || process.env.OPENAI_API_KEY);
}

/**
 * Detects traffic stop phrases and returns the civilian name, or null if not found.
 * Supports many natural ways officers call a traffic stop.
 *
 * Patterns handled:
 *   "show me in/on/as [a] [10-11] with [name]"
 *   "show me with [name]"
 *   "pulling over [name]"  /  "pulling [name] over"
 *   "I'm stopping [name]"  /  "stopping [name]"
 *   "I got [name] / got [name] pulled over"
 *   "traffic stop with [name]"
 *   "I have [name] stopped"
 */
function detectJoinStop(text) {
  const lower = text.toLowerCase();

  // NAME pattern: up to 4 words (covers first + last + possible middle/suffix)
  const NAME = '[A-Za-z0-9_]+(?:\\s+[A-Za-z0-9_]+){0,3}';

  // All patterns return the captured civilian name
  const patterns = [
    // "show me [in/on/as] [a] [ten eleven / 10-11 / code] with NAME"
    new RegExp(`show\\s+me\\s+(?:(?:in|on|as)\\s+)?(?:a\\s+)?(?:(?:ten[-\\s]?\\w+|10[-\\s]?\\d{1,2})\\s+)?with\\s+(${NAME})`, 'i'),
    // "show me with NAME"
    new RegExp(`show\\s+me\\s+with\\s+(${NAME})`, 'i'),
    // "put me in [a] [ten eleven] with NAME"
    new RegExp(`put\\s+me\\s+(?:in\\s+)?(?:a\\s+)?(?:(?:ten[-\\s]?\\w+|10[-\\s]?\\d{1,2})\\s+)?with\\s+(${NAME})`, 'i'),
    // "pulling over NAME" / "pulling NAME over"
    new RegExp(`pulling\\s+over\\s+(${NAME})`, 'i'),
    new RegExp(`pulling\\s+(${NAME})\\s+over`, 'i'),
    // "stopping NAME" / "I'm stopping NAME"
    new RegExp(`(?:i(?:'m|m)\\s+)?stopping\\s+(${NAME})`, 'i'),
    // "traffic stop with NAME"
    new RegExp(`traffic\\s+stop\\s+with\\s+(${NAME})`, 'i'),
    // "got NAME pulled over" / "I got NAME stopped"
    new RegExp(`(?:i\\s+)?got\\s+(${NAME})\\s+(?:pulled\\s+over|stopped)`, 'i'),
    // "I have NAME stopped" / "have NAME pulled over"
    new RegExp(`(?:i\\s+)?have\\s+(${NAME})\\s+(?:stopped|pulled\\s+over)`, 'i'),
    // "out with NAME" (common cop radio phrase)
    new RegExp(`out\\s+with\\s+(${NAME})`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function detectCADLookup(text) {
  const lower = text.toLowerCase().trim();
  console.log(`[CAD Detect] Checking transcript for CAD lookup: "${lower}"`);

  const platePatterns = [
    /run\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?(?:license\s+)?plates?\s+(?:on\s+)?(?:number\s+)?([a-z0-9\s]+)/i,
    /(?:can\s+you\s+)?run\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?plates?\s+(?:for\s+(?:me\s+)?)?([a-z0-9\s]+)/i,
    /plates?\s+(?:number\s+)?(?:is\s+)?([a-z0-9]{2,}(?:\s+[a-z0-9]+)*)\s*(?:run|check|look)/i,
    /(?:check|look\s*up)\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?plates?\s+(?:on\s+)?(?:number\s+)?([a-z0-9\s]+)/i,
    /run\s+([a-z0-9\s]+?)(?:\s+plate|\s+plates)/i,
  ];

  for (const pattern of platePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const raw = match[1].trim().replace(/\s+/g, '').toUpperCase();
      if (raw.length >= 2 && raw.length <= 10) {
        console.log(`[CAD Detect] Plate detected: "${raw}" (pattern: ${pattern.source})`);
        return { type: 'plate', query: raw };
      }
    }
  }

  const namePatterns = [
    /run\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?names?\s+(?:on\s+)?(.+)/i,
    /(?:can\s+you\s+)?run\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?names?\s+(?:for\s+(?:me\s+)?)?(.+)/i,
    /(?:check|look\s*up)\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?names?\s+(?:on\s+)?(.+)/i,
  ];

  for (const pattern of namePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const raw = match[1].trim().replace(/[.,!?]+$/g, '');
      if (raw.length >= 2) {
        console.log(`[CAD Detect] Name detected: "${raw}" (pattern: ${pattern.source})`);
        return { type: 'name', query: raw };
      }
    }
  }

  console.log(`[CAD Detect] No CAD lookup detected in: "${lower}"`);
  return null;
}

async function runCADLookup(guildId, lookup) {
  console.log(`[CAD Lookup] Running ${lookup.type} lookup for "${lookup.query}" in guild ${guildId}`);

  if (lookup.type === 'plate') {
    const escapedPlate = lookup.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const character = await CADCharacter.findOne({
      guildId,
      $or: [
        { licensePlate: { $regex: new RegExp(`^${escapedPlate}$`, 'i') } },
        { 'vehicles.licensePlate': { $regex: new RegExp(`^${escapedPlate}$`, 'i') } },
      ],
    });
    if (!character) {
      console.log(`[CAD Lookup] No records found for plate "${lookup.query}"`);
      return {
        found: false,
        ttsResponse: `Negative on that plate, ${lookup.query.split('').join(' ')} comes back with no records in the system. No registered owner found.`,
      };
    }
    console.log(`[CAD Lookup] Plate match found: owner="${character.characterName}", status="${character.status}"`);

    const vehicle = character.vehicles?.find(v => v.licensePlate?.toUpperCase() === lookup.query) || character.vehicles?.[0];
    const vehicleDesc = vehicle ? `${vehicle.color || ''} ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : 'unknown vehicle';
    const wantedStatus = character.status === 'wanted' ? 'WANTED' : 'clean';
    const licenseStatus = character.driverLicenseStatus || 'unknown';

    const bolos = await BOLO.find({ guildId, characterId: character._id, active: true });
    const hasBolo = bolos.length > 0;

    let tts = `Plate ${lookup.query.split('').join(' ')} comes back to ${character.characterName}, ${vehicleDesc}. Record shows ${wantedStatus}.`;
    if (licenseStatus === 'invalid') tts += ' License is invalid.';
    if (hasBolo) tts += ` Caution, active BOLO on this individual. ${bolos[0].reason}.`;

    return {
      found: true,
      character,
      vehicle,
      bolos,
      ttsResponse: tts,
      embed: {
        owner: character.characterName,
        vehicleDesc,
        plate: lookup.query,
        status: wantedStatus,
        license: licenseStatus,
        hasBolo,
        boloReason: hasBolo ? bolos[0].reason : null,
      },
    };
  }

  if (lookup.type === 'name') {
    const escapedQuery = lookup.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const character = await CADCharacter.findOne({
      guildId,
      characterName: { $regex: new RegExp(escapedQuery, 'i') },
    });
    if (!character) {
      console.log(`[CAD Lookup] No records found for name "${lookup.query}"`);
      return { found: false, ttsResponse: `Negative, no records found for ${lookup.query} in the system.` };
    }
    console.log(`[CAD Lookup] Name match found: "${character.characterName}", status="${character.status}"`);

    const wantedStatus = character.status === 'wanted' ? 'WANTED' : 'clean';
    const licenseStatus = character.driverLicenseStatus || 'unknown';
    const vehicleCount = character.vehicles?.length || 0;
    const bolos = await BOLO.find({ guildId, characterId: character._id, active: true });
    const hasBolo = bolos.length > 0;

    let tts = `${character.characterName}, record shows ${wantedStatus}. License ${licenseStatus}. ${vehicleCount} registered vehicle${vehicleCount !== 1 ? 's' : ''}.`;
    if (hasBolo) tts += ` Caution, active BOLO. ${bolos[0].reason}.`;

    return {
      found: true,
      character,
      bolos,
      ttsResponse: tts,
      embed: {
        name: character.characterName,
        age: character.age,
        gender: character.gender,
        status: wantedStatus,
        license: licenseStatus,
        vehicles: character.vehicles,
        hasBolo,
        boloReason: hasBolo ? bolos[0].reason : null,
      },
    };
  }

  return { found: false, ttsResponse: 'Unable to process lookup request.' };
}

/**
 * Simple name similarity scorer (0–1).
 * Strips non-alphanumeric, checks exact, substring, and token-overlap matches.
 */
function _nameSimilarity(a, b) {
  a = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  b = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;
  // Token overlap (handles "John Smith" vs "johnsmith" etc.)
  const aTok = a.match(/[a-z0-9]+/g) || [];
  const bTok = b.match(/[a-z0-9]+/g) || [];
  const hits = aTok.filter(t => bTok.some(bt => bt.includes(t) || t.includes(bt)));
  return hits.length / Math.max(aTok.length, bTok.length, 1);
}

/**
 * Fuzzy member search.
 * Priority: voice-channel members → full cache → Discord API query.
 * Returns the best match with score ≥ 0.4, or null.
 */
async function findMemberByName(guild, name) {
  const query = name.toLowerCase().trim();
  let bestMember = null;
  let bestScore = 0;

  const score = (member) => {
    const dn = member.displayName;
    const un = member.user.username;
    return Math.max(_nameSimilarity(query, dn), _nameSimilarity(query, un));
  };

  // 1. Search members currently in any voice channel first
  for (const [, channel] of guild.channels.cache) {
    if (!channel.isVoiceBased?.()) continue;
    for (const [, member] of channel.members) {
      if (member.user.bot) continue;
      const s = score(member);
      if (s > bestScore) { bestScore = s; bestMember = member; }
    }
  }
  if (bestScore >= 0.6) {
    console.log(`[Dispatch] Fuzzy match (voice): "${name}" → "${bestMember.displayName}" (score ${bestScore.toFixed(2)})`);
    return bestMember;
  }

  // 2. Full guild member cache
  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const s = score(member);
    if (s > bestScore) { bestScore = s; bestMember = member; }
  }
  if (bestScore >= 0.4) {
    console.log(`[Dispatch] Fuzzy match (cache): "${name}" → "${bestMember.displayName}" (score ${bestScore.toFixed(2)})`);
    return bestMember;
  }

  // 3. Discord API fetch fallback
  try {
    const fetched = await guild.members.fetch({ query: name, limit: 5 });
    const apiMember = fetched.first();
    if (apiMember) {
      console.log(`[Dispatch] Fuzzy match (API): "${name}" → "${apiMember.displayName}"`);
      return apiMember;
    }
  } catch {}

  console.log(`[Dispatch] No fuzzy match found for name: "${name}"`);
  return null;
}

/**
 * Converts spoken word numbers after "ten" into digit form.
 * e.g. "ten eleven" → "10-11", "ten eighty" → "10-80", "ten four" → "10-4"
 */
const WORD_TO_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUM_WORDS = Object.keys(WORD_TO_NUM).join('|');

/**
 * Common spoken phrases that map directly to a 10-code.
 * Checked before digit/word-number parsing so natural phrases take priority.
 * Each entry: [regex, '10-code']
 */
const PHRASE_ALIASES = [
  // 10-4 — Copy / Acknowledged
  [/\b(?:copy\s+that|copy|roger\s+that|roger|acknowledged|affirmative)\b/i, '10-4'],
  // 10-6 — Busy
  [/\b(?:i(?:'m|m)\s+)?busy\b/i, '10-6'],
  // 10-7 — Out of Service
  [/\b(?:going\s+)?(?:out\s+of\s+service|logging\s+off|signing\s+off|going\s+off(?:\s+duty)?)\b/i, '10-7'],
  // 10-8 — Available / In Service
  [/\b(?:i(?:'m|m)\s+)?(?:back\s+(?:in\s+service|available|on\s+patrol)|going\s+available|available|back\s+in\s+service|in\s+service|back\s+on\s+patrol)\b/i, '10-8'],
  [/\bi(?:'m|m)\s+back\b/i, '10-8'],
  // 10-11 — Traffic Stop (no name, just announcing a stop)
  [/\b(?:out\s+with\s+a\s+(?:vehicle|car|truck)|traffic\s+stop|got\s+a\s+stop|making\s+a\s+stop|initiating\s+a\s+stop)\b/i, '10-11'],
  // 10-12 — Stand By
  [/\b(?:stand\s+by|standby)\b/i, '10-12'],
  // 10-17 — En Route / Meet
  [/\b(?:en\s+route\s+to|heading\s+to|on\s+my\s+way\s+to|rolling\s+to)\b/i, '10-17'],
  // 10-20 — Location
  [/\b(?:my\s+location\s+is|i(?:'m|m)\s+(?:at|on|near)|current\s+location)\b/i, '10-20'],
  // 10-76 — En Route (general)
  [/\b(?:en\s+route|on\s+my\s+way|responding)\b/i, '10-76'],
  // 10-80 — Pursuit
  [/\b(?:in\s+pursuit|pursuing|vehicle\s+pursuit|foot\s+pursuit|in\s+a\s+(?:chase|pursuit)|high[\s-]speed\s+chase|chasing)\b/i, '10-80'],
  // 10-97 — On Scene / Arrived
  [/\b(?:on\s+scene|arrived?\s+(?:on\s+)?(?:scene|location)|i(?:'m|m)\s+(?:on\s+scene|at\s+the\s+scene|on\s+location))\b/i, '10-97'],
  // 10-99 — Officer Down / Emergency
  [/\b(?:officer\s+down|shots?\s+fired|officer\s+needs?\s+(?:immediate\s+)?(?:help|assistance|backup)|mayday|emergency)\b/i, '10-99'],
];

function normalizeSpokenCodes(text) {
  let result = text;

  // Apply phrase aliases first (before number-word normalization)
  for (const [pattern, code] of PHRASE_ALIASES) {
    if (pattern.test(result)) {
      result = result.replace(pattern, code);
    }
  }

  // Then convert "ten [word]" → "10-[digit]"
  result = result.replace(
    new RegExp(
      `\\bten[-\\s]?(${NUM_WORDS})(?:[-\\s](${NUM_WORDS}))?\\b`,
      'gi'
    ),
    (_, part1, part2) => {
      let val = WORD_TO_NUM[part1.toLowerCase()] || 0;
      if (part2) val += WORD_TO_NUM[part2.toLowerCase()] || 0;
      return `10-${val}`;
    }
  );

  return result;
}

function parseTranscript(text) {
  const normalized = normalizeSpokenCodes(text);
  const lower = normalized.toLowerCase();

  let detectedCode = null;
  for (const code of Object.keys(TEN_CODES)) {
    const escaped = code.replace('-', '[\\-\\s]?');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
      detectedCode = code;
      break;
    }
  }

  // Subject: "with NAME", "stopping NAME", "pulling over NAME"
  const withMatch = lower.match(/\bwith\s+([a-z][a-z0-9\s]{1,30}?)(?:\s+at|\s+on|\s+near|\s*$)/i);

  // Location: "at PLACE", "on STREET", "near AREA", "by PLACE", "off STREET"
  const locationMatch = lower.match(/\b(?:at|on|near|by|off)\s+(.{2,40}?)(?:\s+with|\s*$)/i);

  // Fallback: "show me [code]" pattern (after normalization handles the number)
  const showMeMatch = lower.match(/show\s+me\s+(?:(?:in|on|as|a)\s+)?(\d{2}[-\s]\d{1,2})/i);
  if (!detectedCode && showMeMatch) {
    const raw = showMeMatch[1].replace(/\s/, '-');
    const candidate = `10-${raw.split('-')[1] || raw}`;
    if (TEN_CODES[candidate]) detectedCode = candidate;
  }

  if (detectedCode) {
    console.log(`[Dispatch] Detected code: ${detectedCode} from: "${text.trim()}" → normalized: "${normalized.trim()}"`);
  } else {
    console.log(`[Dispatch] No code detected in: "${text.trim()}"`);
  }

  return {
    code: detectedCode,
    codeInfo: detectedCode ? TEN_CODES[detectedCode] : null,
    subject: withMatch ? withMatch[1].trim() : null,
    location: locationMatch ? locationMatch[1].trim() : null,
    rawText: text.trim(),
  };
}

const WHISPER_PROMPT =
  'Police radio communication. Common terms: dispatch, 10-4, 10-7, 10-8, 10-11, 10-20, 10-80, 10-97, 10-99, ' +
  'traffic stop, show me in, show me on, available, out of service, in pursuit, on scene, run the plate, run the name, ' +
  'pulling over, backing up, requesting backup, officer down, copy that.';

async function transcribeAudio(wavBuffer) {
  const tempPath = join(tmpdir(), `dispatch_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  writeFileSync(tempPath, wavBuffer);
  try {
    let lastErr;
    const maxTries = Math.max(1, groqKeys.length);
    for (let attempt = 0; attempt < maxTries; attempt++) {
      const { client, provider } = getAIClient();
      const model = provider === 'groq' ? 'whisper-large-v3' : 'whisper-1';
      try {
        const result = await client.audio.transcriptions.create({
          file: createReadStream(tempPath),
          model,
          language: 'en',
          prompt: WHISPER_PROMPT,
        });
        return result.text || '';
      } catch (err) {
        lastErr = err;
        if (err.status === 429 && provider === 'groq' && rotateGroqKey()) {
          console.log(`[Transcribe] Rate limited on key ${attempt + 1}, trying next key...`);
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
}

const TTS_CACHE_DIR = join(tmpdir(), 'everlink_tts_cache');
const ttsMemCache = new Map();
const TTS_MEM_CACHE_MAX = 30;

try { mkdirSync(TTS_CACHE_DIR, { recursive: true }); } catch {}

function ttsCacheKey(text) {
  return createHash('md5').update(text.toLowerCase().trim()).digest('hex');
}

/**
 * Converts numeric 10-codes to their spoken word form so TTS reads them naturally.
 * "10-11" → "ten eleven", not "one zero one one".
 */
const CODE_TO_SPEECH = {
  '10-4': 'ten four', '10-6': 'ten six', '10-7': 'ten seven', '10-8': 'ten eight',
  '10-11': 'ten eleven', '10-12': 'ten twelve', '10-15': 'ten fifteen',
  '10-17': 'ten seventeen', '10-20': 'ten twenty', '10-76': 'ten seventy six',
  '10-78': 'ten seventy eight', '10-80': 'ten eighty', '10-97': 'ten ninety seven',
  '10-99': 'ten ninety nine',
};

function formatCodeForSpeech(text) {
  let result = text;
  for (const [code, spoken] of Object.entries(CODE_TO_SPEECH)) {
    const escaped = code.replace('-', '[-\\s]');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), spoken);
  }
  return result;
}

export async function generateDispatchTTSPublic(text) {
  return generateDispatchTTS(text);
}

async function generateDispatchTTS(text) {
  text = text.replace(/\b911\b/g, '9 1 1');
  text = formatCodeForSpeech(text);
  const key = ttsCacheKey(text);

  if (ttsMemCache.has(key)) {
    console.log(`[TTS Cache] Memory hit for: "${text.slice(0, 40)}..."`);
    return ttsMemCache.get(key);
  }

  const diskPath = join(TTS_CACHE_DIR, `${key}.bin`);
  if (existsSync(diskPath)) {
    const buf = readFileSync(diskPath);
    ttsMemCache.set(key, buf);
    if (ttsMemCache.size > TTS_MEM_CACHE_MAX) {
      const oldest = ttsMemCache.keys().next().value;
      ttsMemCache.delete(oldest);
    }
    console.log(`[TTS Cache] Disk hit for: "${text.slice(0, 40)}..."`);
    return buf;
  }

  let buf;
  let lastErr;
  const maxTries = Math.max(1, groqKeys.length);
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const { client, provider } = getAIClient();
    const model = provider === 'groq' ? 'canopylabs/orpheus-v1-english' : 'tts-1';
    const voice = provider === 'groq' ? 'diana' : 'nova';
    try {
      if (attempt === 0) console.log(`[TTS] Generating new audio (${text.length} chars): "${text.slice(0, 60)}..."`);
      const response = await client.audio.speech.create({
        model,
        voice,
        input: text,
        response_format: provider === 'groq' ? 'wav' : 'opus',
      });
      buf = Buffer.from(await response.arrayBuffer());
      break;
    } catch (err) {
      lastErr = err;
      if (err.status === 429 && provider === 'groq' && rotateGroqKey()) {
        console.log(`[TTS] Rate limited on key ${attempt + 1}, trying next key...`);
        continue;
      }
      throw err;
    }
  }
  if (!buf) throw lastErr;

  ttsMemCache.set(key, buf);
  if (ttsMemCache.size > TTS_MEM_CACHE_MAX) {
    const oldest = ttsMemCache.keys().next().value;
    ttsMemCache.delete(oldest);
  }
  try { writeFileSync(diskPath, buf); } catch {}

  return buf;
}

const SIMPLE_ACK_CODES = new Set(['10-4', '10-8', '10-7', '10-6']);

async function generateDispatchResponse(officerName, parsed, guildId) {
  if (parsed.code && SIMPLE_ACK_CODES.has(parsed.code) && !parsed.subject && !parsed.location) {
    const label = TEN_CODES[parsed.code]?.label || parsed.code;
    return `10-4 ${officerName}, copy ${label}.`;
  }

  let callContext = '';
  try {
    const activeCalls = await EmergencyCall.find({ guildId, status: 'active' }).sort({ timestamp: -1 }).limit(5).lean();
    if (activeCalls.length > 0) {
      const callLines = activeCalls.map(c => {
        const callNum = c.callId?.split('-').pop() || '???';
        let line = `Call #${callNum}: ${c.issue || 'unknown'}`;
        if (c.location) line += ` at ${c.location}`;
        if (c.respondingLeoId) line += ` (unit responding)`;
        else line += ` (NO units responding)`;
        return line;
      });
      callContext = `\nActive 911 calls:\n${callLines.join('\n')}`;
    }
  } catch {}

  const callText = parsed.rawText || `${parsed.code || 'unknown status'}`;
  let lastErr;
  const maxTries = Math.max(1, groqKeys.length);
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const { client, provider } = getAIClient();
    const model = provider === 'groq' ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `You are a police radio dispatcher in a GTA 5 FiveM RP community. Keep responses to 1 short sentence. Use 10-codes. Only acknowledge what the officer said — no assumptions. If they mention running a plate or name, say "Copy, say again the plate number" or "say again the name". Do NOT make up 911 calls or incidents — only reference the active calls listed below. If there are no active calls listed, do not mention any.${callContext}`,
          },
          {
            role: 'user',
            content: `Officer ${officerName}: "${callText}"`,
          },
        ],
        max_tokens: 60,
        temperature: 0.7,
      });
      return response.choices[0]?.message?.content?.trim() || '10-4, copy that.';
    } catch (err) {
      lastErr = err;
      if (err.status === 429 && provider === 'groq' && rotateGroqKey()) {
        console.log(`[AI Response] Rate limited on key ${attempt + 1}, trying next key...`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function processVoiceCall(wavBuffer, userId, guild, client) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config || !config.enabled || !config.dispatchChannelId) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const cadConfig = await CADConfig.findOne({ guildId: guild.id });
    const leoRoleIds = config.leoRoleIds?.length > 0 ? config.leoRoleIds : (cadConfig?.leoRoleIds ?? []);
    const isLeo = leoRoleIds.length === 0 || member.roles.cache.some(r => leoRoleIds.includes(r.id));
    if (!isLeo) return;

    const officerName = member.displayName || member.user.username;
    console.log(`[Dispatch] Processing audio from ${officerName} in ${guild.name}`);

    let transcript = '';
    try {
      transcript = await transcribeAudio(wavBuffer);
    } catch (err) {
      console.error('[Dispatch] Transcription error:', err.message);
      return;
    }

    if (!transcript || transcript.trim().length < 3) return;
    console.log(`[Dispatch] Transcript: "${transcript}"`);

    const words = transcript.trim().toLowerCase().split(/\s+/);
    const dispatchIdx = words.findIndex(w => w.replace(/[^a-z]/g, '') === 'dispatch');
    if (dispatchIdx === -1 || dispatchIdx > 5) {
      console.log(`[Dispatch] Ignored — officer did not address dispatch (word index: ${dispatchIdx})`);
      return;
    }
    const cleanedTranscript = words.slice(dispatchIdx + 1).join(' ');
    if (cleanedTranscript.length < 2) return;
    transcript = cleanedTranscript;
    console.log(`[Dispatch] Cleaned transcript: "${transcript}"`);

    // --- "Show me in / show me on" join-stop detection ---
    const joinTargetName = detectJoinStop(transcript);
    if (joinTargetName && config.trafficStopChannelIds?.length > 0) {
      const civMember = await findMemberByName(guild, joinTargetName);

      // Pick least occupied traffic stop channel
      let bestChannelId = null;
      let bestCount = Infinity;
      for (const id of config.trafficStopChannelIds) {
        if (id === member.voice?.channelId) continue;
        const ch = guild.channels.cache.get(id) ||
          await guild.channels.fetch(id).catch(() => null);
        if (!ch) continue;
        const count = ch.members.filter(m => !m.user.bot).size;
        if (count < bestCount) { bestCount = count; bestChannelId = id; }
      }

      if (bestChannelId) {
        // Move officer
        if (member.voice?.channelId) {
          await member.voice.setChannel(bestChannelId).catch(() => {});
        }
        // Move civilian if they are in any voice channel
        if (civMember?.voice?.channelId && civMember.voice.channelId !== bestChannelId) {
          await civMember.voice.setChannel(bestChannelId).catch(() => {});
        }

        await updateOfficerStatus(guild.id, userId, officerName, '10-11',
          { code: '10-11', codeInfo: TEN_CODES['10-11'], subject: joinTargetName, location: null, rawText: transcript },
          null, bestChannelId);

        const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

        if (dispatchCh?.isTextBased()) {
          const civLine = civMember
            ? `<@${civMember.id}> (${civMember.displayName || civMember.user.username})`
            : `**${joinTargetName}**`;

          const stopEmbed = new EmbedBuilder()
            .setColor('#2d2d2d')
            .setTitle('Traffic Stop Active')
            .setDescription(
              `**Officer:** <@${userId}>\n` +
              `**With:** ${civLine}\n` +
              `**Moved to:** <#${bestChannelId}>\n\n` +
              `Both parties have been moved to the traffic stop channel.\n` +
              `Press **"10-8 — Stop Clear"** when the stop is finished, or the officer can say *"10-8"* when back in patrol.`
            )
            .addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false })
            .setFooter({ text: 'RPM' })
            .setTimestamp();

          const clearBtn = new ButtonBuilder()
            .setCustomId(`dispatch_stop_clear_${userId}`)
            .setLabel('10-8 — Stop Clear')
            .setStyle(ButtonStyle.Success);

          await dispatchCh.send({ embeds: [stopEmbed], components: [new ActionRowBuilder().addComponents(clearBtn)] }).catch(() => {});
        }

        // Speak the confirmation in voice
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const civName = civMember?.displayName || civMember?.user?.username || joinTargetName;
            const ttsText = `Copy ${officerName}, showing you in on the traffic stop with ${civName}. Both parties have been moved.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) {
            console.error('[Dispatch TTS] Join-stop voice error:', err.message);
          }
        }

        await rebuildStatusBoard(guild, config);
      }
      return;
    }
    // --- End join-stop detection ---

    // --- CAD lookup detection (run plate / run name) ---
    const cadLookup = detectCADLookup(transcript);
    if (cadLookup) {
      console.log(`[Dispatch] CAD lookup detected: ${cadLookup.type} → "${cadLookup.query}"`);
      const result = await runCADLookup(guild.id, cadLookup);

      const dispatchChannel = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

      if (dispatchChannel?.isTextBased()) {
        if (cadLookup.type === 'plate') {
          const embed = new EmbedBuilder()
            .setColor('#2d2d2d')
            .setTitle('Plate Lookup')
            .setFooter({ text: 'RPM' })
            .setTimestamp()
            .addFields(
              { name: 'Requested By', value: `<@${userId}>`, inline: true },
              { name: 'Plate', value: cadLookup.query, inline: true },
            );
          if (result.found) {
            embed.addFields(
              { name: 'Owner', value: result.embed.owner, inline: true },
              { name: 'Vehicle', value: result.embed.vehicleDesc || 'N/A', inline: true },
              { name: 'Status', value: result.embed.status, inline: true },
              { name: 'License', value: result.embed.license, inline: true },
            );
            if (result.embed.hasBolo) {
              embed.addFields({ name: 'BOLO', value: result.embed.boloReason, inline: false });
            }
          } else {
            embed.addFields({ name: 'Result', value: 'No records found — plate is not registered in the system', inline: false });
          }
          embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });
          await dispatchChannel.send({ embeds: [embed] }).catch((e) => console.error('[CAD Lookup] Failed to send plate embed:', e.message));
        } else {
          const embed = new EmbedBuilder()
            .setColor('#2d2d2d')
            .setTitle('Name Lookup')
            .setFooter({ text: 'RPM' })
            .setTimestamp()
            .addFields(
              { name: 'Requested By', value: `<@${userId}>`, inline: true },
              { name: 'Name', value: cadLookup.query, inline: true },
            );
          if (result.found) {
            embed.addFields(
              { name: 'Name', value: result.embed.name, inline: true },
              { name: 'Status', value: result.embed.status, inline: true },
              { name: 'License', value: result.embed.license, inline: true },
            );
            if (result.embed.age) embed.addFields({ name: 'Age', value: `${result.embed.age}`, inline: true });
            if (result.embed.gender) embed.addFields({ name: 'Gender', value: result.embed.gender, inline: true });
            if (result.embed.vehicles?.length > 0) {
              const vList = result.embed.vehicles.map(v => `${v.color || ''} ${v.year || ''} ${v.make || ''} ${v.model || ''} — ${v.licensePlate || 'No Plate'}`.trim()).join('\n');
              embed.addFields({ name: 'Vehicles', value: vList, inline: false });
            }
            if (result.embed.hasBolo) {
              embed.addFields({ name: 'BOLO', value: result.embed.boloReason, inline: false });
            }
          } else {
            embed.addFields({ name: 'Result', value: 'No records found — name is not in the system', inline: false });
          }
          embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });
          await dispatchChannel.send({ embeds: [embed] }).catch((e) => console.error('[CAD Lookup] Failed to send name embed:', e.message));
        }
      } else {
        console.error(`[CAD Lookup] Dispatch channel not found: ${config.dispatchChannelId}`);
      }

      console.log(`[CAD Lookup] Generating TTS response: "${result.ttsResponse}"`);
      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(result.ttsResponse);
          console.log(`[CAD Lookup] TTS buffer generated (${ttsBuffer.length} bytes), playing audio`);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) {
          console.error('[Dispatch TTS] CAD lookup voice error:', err.message);
        }
      } else {
        console.log(`[CAD Lookup] TTS skipped — aiEnabled=${config.aiEnabled}, hasKey=${hasAIKey()}`);
      }
      return;
    }
    // --- End CAD lookup detection ---

    // --- "Attach me to that call" / "respond to that call" voice detection ---
    const attachPattern = /\b(?:attach(?:\s+me)?|respond(?:ing)?|show\s+me(?:\s+responding)?|i'?m\s+(?:responding|attaching|en\s*route))(?:\s+(?:to|on|for))?\s+(?:that\s+(?:call|911)|the\s+(?:call|911)|call\s*(?:#?\s*(\d+))?|911\s*(?:call)?(?:\s*#?\s*(\d+))?)/i;
    const attachMatch = transcript.match(attachPattern);
    if (attachMatch) {
      const specifiedCallNum = attachMatch[1] || attachMatch[2];
      console.log(`[Dispatch] Attach/respond voice command detected from ${officerName}${specifiedCallNum ? ` for call #${specifiedCallNum}` : ''}`);

      try {
        let call;
        if (specifiedCallNum) {
          call = await EmergencyCall.findOne({
            guildId: guild.id,
            status: 'active',
            callId: { $regex: specifiedCallNum + '$' },
          });
        }
        if (!call) {
          call = await EmergencyCall.findOne({
            guildId: guild.id,
            status: 'active',
          }).sort({ timestamp: -1 });
        }

        if (!call) {
          console.log('[Dispatch] No active 911 calls to attach to');
          if (config.aiEnabled && hasAIKey()) {
            const ttsText = `Negative ${officerName}, there are no active 911 calls at this time.`;
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          }
          return;
        }

        const callNum = call.callId?.split('-').pop() || '???';
        const alreadyAttached = call.attachedLeoIds?.includes(userId);
        const isPrimary = call.respondingLeoId === userId;

        if (alreadyAttached || isPrimary) {
          console.log(`[Dispatch] ${officerName} already on call #${callNum}`);
          if (config.aiEnabled && hasAIKey()) {
            const ttsText = `${officerName}, you are already ${isPrimary ? 'primary responder' : 'attached'} on call number ${callNum}.`;
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          }
          return;
        }

        if (!call.respondingLeoId) {
          call.respondingLeoId = userId;
          call.respondingLeoUsername = officerName;
        } else {
          call.attachedLeoIds.push(userId);
        }
        await call.save();

        const role = call.respondingLeoId === userId ? 'primary responder' : 'attached';
        console.log(`[Dispatch] ${officerName} is now ${role} on call #${callNum}`);

        const dispatchChannel = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

        if (dispatchChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#2d2d2d')
            .setTitle(`Unit ${role === 'primary responder' ? 'Responding' : 'Attached'} — Call #${callNum}`)
            .setDescription(
              `**Officer:** <@${userId}>\n` +
              `**Call:** #${callNum} — ${call.issue || 'Unknown'}\n` +
              `**Location:** ${call.location || 'Unknown'}\n` +
              `**Role:** ${role === 'primary responder' ? 'Primary Responder' : 'Attached'}`
            )
            .setFooter({ text: 'RPM' })
            .setTimestamp();
          await dispatchChannel.send({ embeds: [embed] }).catch(() => {});
        }

        if (call.messageId && call.channelId) {
          try {
            const callChannel = guild.channels.cache.get(call.channelId) ||
              await guild.channels.fetch(call.channelId).catch(() => null);
            if (callChannel?.isTextBased()) {
              const callMsg = await callChannel.messages.fetch(call.messageId).catch(() => null);
              if (callMsg) {
                const existingEmbed = callMsg.embeds[0];
                if (existingEmbed) {
                  let description = existingEmbed.description || '';
                  let responderText = '';
                  if (call.respondingLeoId) {
                    responderText += `**PRIMARY:** ${call.respondingLeoUsername || 'Unknown'}`;
                  }
                  const attachedOthers = (call.attachedLeoIds || []).filter(id => id !== call.respondingLeoId);
                  if (attachedOthers.length > 0) {
                    if (responderText) responderText += '\n';
                    responderText += `**ATTACHED:** ${attachedOthers.map(id => `<@${id}>`).join(', ')}`;
                  }
                  const responderMatch = description.match(/(\n\n\*\*PRIMARY.*)?(\n\*\*ATTACHED:.*)?$/);
                  if (responderMatch && responderMatch.index > 0) {
                    description = description.substring(0, responderMatch.index) + '\n\n' + responderText;
                  } else {
                    description += '\n\n' + responderText;
                  }
                  const updatedEmbed = EmbedBuilder.from(existingEmbed).setDescription(description);
                  await callMsg.edit({ embeds: [updatedEmbed] }).catch(() => {});
                }
              }
            }
          } catch (err) {
            console.error('[Dispatch] Failed to update 911 embed:', err.message);
          }
        }

        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsText = `Copy ${officerName}, showing you as ${role} on call number ${callNum}. ${call.issue || ''} at ${call.location || 'unknown location'}.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) {
            console.error('[Dispatch TTS] Attach voice error:', err.message);
          }
        }

        await rebuildStatusBoard(guild, config);
      } catch (err) {
        console.error('[Dispatch] Attach to call error:', err.message);
      }
      return;
    }
    // --- End attach/respond detection ---

    const parsed = parseTranscript(transcript);

    let dispatchResponse = null;
    if (config.aiEnabled && hasAIKey()) {
      try {
        dispatchResponse = await generateDispatchResponse(officerName, parsed, guild.id);
      } catch (err) {
        console.error('[Dispatch] AI response error:', err.message);
      }
    }

    const dispatchChannel = guild.channels.cache.get(config.dispatchChannelId) ||
      await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

    if (dispatchChannel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor('#2d2d2d')
        .setTitle('Dispatch Radio')
        .setFooter({ text: 'RPM' })
        .setTimestamp()
        .addFields(
          { name: 'Officer', value: `<@${userId}>`, inline: true },
          { name: 'Code', value: parsed.code ? `**${parsed.code}** — ${TEN_CODES[parsed.code]?.label}` : 'Unknown', inline: true },
        );

      if (parsed.subject) embed.addFields({ name: 'With', value: parsed.subject, inline: true });
      if (parsed.location) embed.addFields({ name: 'Location', value: parsed.location, inline: true });

      embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });

      if (dispatchResponse) {
        embed.addFields({ name: 'Dispatch Response', value: `*"${dispatchResponse}"*`, inline: false });
      }

      await dispatchChannel.send({ embeds: [embed] }).catch(() => {});
    }

    const isSimpleAck = parsed.code && SIMPLE_ACK_CODES.has(parsed.code) && !parsed.subject && !parsed.location;
    if (dispatchResponse && config.aiEnabled && hasAIKey() && !isSimpleAck) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');
        const ttsBuffer = await generateDispatchTTS(dispatchResponse);
        playDispatchVoice(guild.id, ttsBuffer);
      } catch (err) {
        console.error('[Dispatch TTS] Error generating or playing voice:', err.message);
      }
    } else if (isSimpleAck) {
      console.log(`[Dispatch] Skipping TTS for simple ${parsed.code} acknowledgment (saving tokens)`);
    }

    const voiceAction = parsed.codeInfo?.action;
    if (voiceAction === 'traffic_stop' && config.trafficStopChannelIds?.length > 0) {
      try {
        // Pick the traffic stop channel with the fewest non-bot members (load balance)
        let bestChannelId = null;
        let bestCount = Infinity;
        for (const id of config.trafficStopChannelIds) {
          if (id === member.voice?.channelId) continue;
          const ch = guild.channels.cache.get(id) ||
            await guild.channels.fetch(id).catch(() => null);
          if (!ch) continue;
          const count = ch.members.filter(m => !m.user.bot).size;
          if (count < bestCount) { bestCount = count; bestChannelId = id; }
        }
        if (bestChannelId && member.voice?.channelId) {
          await member.voice.setChannel(bestChannelId);
          await updateOfficerStatus(guild.id, userId, officerName, '10-11', parsed, null, bestChannelId);
        }
        // Post a traffic stop active notice with a 10-8 clear button in the dispatch channel
        if (config.dispatchChannelId) {
          const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
          if (dispatchCh?.isTextBased()) {
            const stopEmbed = new EmbedBuilder()
              .setColor('#FF8C00')
              .setTitle('Traffic Stop Active — 10-11')
              .setDescription(
                `**Officer:** <@${userId}>\n` +
                `**Moved to:** <#${bestChannelId}>\n\n` +
                `Officer **${officerName}** is on a **10-11**. They must return to patrol on their own.\n\n` +
                `Press **"10-8 — Stop Clear"** when the stop is finished, or the officer can say *"10-8"* when back in the patrol channel.`
              )
              .setFooter({ text: 'RPM • Dispatch' })
              .setTimestamp();
            const clearBtn = new ButtonBuilder()
              .setCustomId(`dispatch_stop_clear_${userId}`)
              .setLabel('10-8 — Stop Clear')
              .setStyle(ButtonStyle.Success);
            await dispatchCh.send({ embeds: [stopEmbed], components: [new ActionRowBuilder().addComponents(clearBtn)] }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[Dispatch] Voice channel move error:', err.message);
      }
    } else if (voiceAction === 'available') {
      // Officer called 10-8 verbally — clear their stop status (they move back themselves)
      await updateOfficerStatus(guild.id, userId, officerName, '10-8', parsed, null);
    } else if (voiceAction === 'out_of_service') {
      await OfficerStatus.deleteOne({ guildId: guild.id, userId }).catch(() => {});
    } else if (parsed.code) {
      const existing = await OfficerStatus.findOne({ guildId: guild.id, userId });
      await updateOfficerStatus(guild.id, userId, officerName, parsed.code, parsed, existing?.lastPatrolChannelId || null);

      // 10-99 — Panic alert: broadcast urgent all-units notice
      if (parsed.code === '10-99') {
        await triggerPanicAlert(guild, config, userId, officerName, member?.voice?.channelId || null);
      }
    }

    await rebuildStatusBoard(guild, config);
  } catch (err) {
    console.error('[Dispatch] processVoiceCall error:', err.message);
  }
}

async function updateOfficerStatus(guildId, userId, username, tenCode, parsed, lastPatrolChannelId, trafficStopChannelId = null) {
  const isTrafficStop = tenCode === '10-11';
  const update = {
    guildId,
    userId,
    username,
    tenCode,
    subject: parsed?.subject || null,
    location: parsed?.location || null,
    rawCall: parsed?.rawText || null,
    lastPatrolChannelId: lastPatrolChannelId || null,
    updatedAt: new Date(),
  };

  if (isTrafficStop) {
    const existing = await OfficerStatus.findOne({ guildId, userId });
    if (!existing || existing.tenCode !== '10-11') {
      update.trafficStopStartAt = new Date();
    }
    if (trafficStopChannelId) update.trafficStopChannelId = trafficStopChannelId;
  } else {
    update.trafficStopStartAt = null;
    update.trafficStopChannelId = null;
  }

  await OfficerStatus.findOneAndUpdate(
    { guildId, userId },
    update,
    { upsert: true, new: true }
  );
}

export async function rebuildStatusBoard(guild, config) {
  if (!config?.statusBoardChannelId) return;

  const channel = guild.channels.cache.get(config.statusBoardChannelId) ||
    await guild.channels.fetch(config.statusBoardChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000);
  const officers = await OfficerStatus.find({
    guildId: guild.id,
    updatedAt: { $gte: cutoff },
  }).sort({ updatedAt: -1 });

  const activeCalls = await EmergencyCall.find({
    guildId: guild.id,
    status: 'active',
  }).sort({ timestamp: -1 });

  const embeds = [];

  const officerEmbed = new EmbedBuilder()
    .setColor('#2d2d2d')
    .setTitle('Officer Status Board')
    .setFooter({ text: 'RPM' })
    .setTimestamp();

  if (officers.length === 0) {
    officerEmbed.setDescription('*No officers currently on duty.*');
  } else {
    const rows = officers.map((o) => {
      const codeLabel = TEN_CODES[o.tenCode]?.label || o.tenCode;
      const since = `<t:${Math.floor(new Date(o.updatedAt).getTime() / 1000)}:R>`;
      let line = `<@${o.userId}> — **${codeLabel}**`;
      if (o.subject) line += ` · with ${o.subject}`;
      if (o.location) line += ` @ ${o.location}`;
      line += ` · ${since}`;

      const attachedCall = activeCalls.find(c =>
        c.respondingLeoId === o.userId || c.attachedLeoIds?.includes(o.userId)
      );
      if (attachedCall) {
        line += ` · [${attachedCall.respondingLeoId === o.userId ? 'PRIMARY' : 'ATTACHED'} — Call #${attachedCall.callId?.split('-').pop() || '???'}]`;
      }

      return line;
    });
    officerEmbed.setDescription(rows.join('\n'));
  }
  embeds.push(officerEmbed);

  if (activeCalls.length > 0) {
    const callEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Active 911 Calls')
      .setTimestamp();

    const callRows = activeCalls.map(c => {
      const since = `<t:${Math.floor(new Date(c.timestamp).getTime() / 1000)}:R>`;
      const callNum = c.callId?.split('-').pop() || '???';
      let line = `**Call #${callNum}** · ${since}`;
      if (c.issue) line += `\n┗ ${c.issue}`;
      if (c.location) line += ` @ ${c.location}`;

      if (c.respondingLeoId) {
        line += `\n┗ Primary: <@${c.respondingLeoId}>`;
      }
      if (c.attachedLeoIds?.length > 0) {
        const attached = c.attachedLeoIds.filter(id => id !== c.respondingLeoId);
        if (attached.length > 0) {
          line += `\n┗ Attached: ${attached.map(id => `<@${id}>`).join(', ')}`;
        }
      }
      if (!c.respondingLeoId && c.attachedLeoIds?.length === 0) {
        line += `\n┗ **NO UNITS RESPONDING**`;
      }

      return line;
    });
    callEmbed.setDescription(callRows.join('\n\n'));
    embeds.push(callEmbed);
  }

  const clearButtons = officers.slice(0, 20).map((o) =>
    new ButtonBuilder()
      .setCustomId(`dispatch_clear_status_${o.userId}`)
      .setLabel(o.username.slice(0, 20))
      .setStyle(ButtonStyle.Secondary)
      
  );

  const components = [];
  for (let i = 0; i < clearButtons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(clearButtons.slice(i, i + 5)));
  }

  try {
    if (config.statusBoardMessageId) {
      const existing = await channel.messages.fetch(config.statusBoardMessageId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds, components });
        return;
      }
    }

    const msg = await channel.send({ embeds, components });
    await msg.pin().catch(() => {});
    await DispatchConfig.updateOne({ guildId: guild.id }, { statusBoardMessageId: msg.id });
  } catch (err) {
    console.error('[Dispatch] Status board update error:', err.message);
  }
}

export async function handleClearStatusButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_clear_status_', '');

    const { checkStaffPermission, isAdmin } = await import('../utils/permissions.js');
    const isStaff = await checkStaffPermission(interaction) || await isAdmin(interaction.member);
    const isSelf = interaction.user.id === targetUserId;

    if (!isStaff && !isSelf) {
      return interaction.reply({
        embeds: [errorEmbed('Only staff or the officer themselves can clear a status.')],
        flags: 64,
      });
    }

    await OfficerStatus.deleteOne({ guildId: interaction.guildId, userId: targetUserId });

    const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const targetMention = targetUserId === interaction.user.id ? 'Your' : `<@${targetUserId}>'s`;
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription(`${targetMention} status has been cleared from the board.`).setFooter({ text: 'RPM' })],
      flags: 64,
    });
  } catch (err) {
    console.error('[Dispatch] Clear status error:', err.message);
    return interaction.reply({
      embeds: [errorEmbed('An error occurred while clearing the status.')],
      flags: 64,
    });
  }
}

export async function handleStopClearButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_stop_clear_', '');

    const isAdmin = interaction.member.permissions.has('Administrator');
    const isSelf = interaction.user.id === targetUserId;
    const staffDoc = await (await import('../models/Staff.js')).default
      .findOne({ guildId: interaction.guildId, userId: interaction.user.id }).catch(() => null);
    const isStaff = !!staffDoc;

    if (!isAdmin && !isStaff && !isSelf) {
      return interaction.reply({
        embeds: [errorEmbed('Only staff, the officer themselves, or an admin can clear this traffic stop.')],
        flags: 64,
      });
    }

    await OfficerStatus.deleteOne({ guildId: interaction.guildId, userId: targetUserId });

    const config = await DispatchConfig.findOne({ guildId: interaction.guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const clearEmbed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setTitle('Traffic Stop Cleared')
      .setDescription(`<@${targetUserId}> is **10-8 — Available**. The traffic stop has been cleared.`)
      .setFooter({ text: 'RPM' })
      .setTimestamp();

    return interaction.update({ embeds: [clearEmbed], components: [] });
  } catch (err) {
    console.error('[Dispatch] Stop clear button error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 10-99 PANIC ALERT
// ────────────────────────────────────────────────────────────────────────────
async function triggerPanicAlert(guild, config, userId, officerName, voiceChannelId) {
  try {
    const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
      await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
    if (!dispatchCh?.isTextBased()) return;

    const locationText = voiceChannelId ? `<#${voiceChannelId}>` : 'Unknown location';

    const panicEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 10-99 — OFFICER NEEDS ASSISTANCE 🚨')
      .setDescription(
        `**ALL UNITS — RESPOND IMMEDIATELY**\n\n` +
        `**Officer:** <@${userId}> (${officerName})\n` +
        `**Last Known Location:** ${locationText}\n\n` +
        `**10-99 — All available officers need to respond to this officer's location immediately.**`
      )
      .setFooter({ text: 'RPM • PANIC ALERT' })
      .setTimestamp();

    const acknowledgeBtn = new ButtonBuilder()
      .setCustomId(`dispatch_panic_ack_${userId}`)
      .setLabel('Acknowledge & En Route')
      .setStyle(ButtonStyle.Danger);

    await dispatchCh.send({
      content: '@here',
      embeds: [panicEmbed],
      components: [new ActionRowBuilder().addComponents(acknowledgeBtn)],
    }).catch(() => {});

    // TTS panic broadcast
    if (config.aiEnabled && hasAIKey()) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');
        const ttsText = `Ten ninety nine, ten ninety nine. All units, officer ${officerName} needs immediate assistance. All available units respond immediately. This is a ten ninety nine emergency.`;
        const ttsBuffer = await generateDispatchTTS(ttsText);
        playDispatchVoice(guild.id, ttsBuffer);
      } catch (err) {
        console.error('[Dispatch TTS] Panic alert TTS error:', err.message);
      }
    }

    console.log(`[Dispatch] 10-99 PANIC ALERT triggered for ${officerName} in ${guild.name}`);
  } catch (err) {
    console.error('[Dispatch] triggerPanicAlert error:', err.message);
  }
}

export async function handlePanicAckButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_panic_ack_', '');
    const responderName = interaction.member.displayName || interaction.user.username;

    const updatedEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 10-99 — OFFICER NEEDS ASSISTANCE 🚨')
      .setDescription(
        (interaction.message.embeds[0]?.description || '') +
        `\n\n✅ **<@${interaction.user.id}> (${responderName}) is en route.**`
      )
      .setFooter({ text: 'RPM • PANIC ALERT' })
      .setTimestamp();

    const disabledBtn = new ButtonBuilder()
      .setCustomId(`dispatch_panic_ack_${targetUserId}`)
      .setLabel(`${responderName} — En Route`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    await interaction.update({ embeds: [updatedEmbed], components: [new ActionRowBuilder().addComponents(disabledBtn)] });
  } catch (err) {
    console.error('[Dispatch] Panic ack button error:', err.message);
    interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TRAFFIC STOP CHECK-IN TIMER (every 1 minute)
// ────────────────────────────────────────────────────────────────────────────
const trafficStopCheckIntervals = new Map();
const trafficStopCheckinSent = new Map(); // key: guildId:userId — tracks last checkin msg time

async function checkTrafficStops(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled || !config.dispatchChannelId) return;

    const onStopOfficers = await OfficerStatus.find({ guildId: guild.id, tenCode: '10-11' });
    if (onStopOfficers.length === 0) return;

    for (const officer of onStopOfficers) {
      const key = `${guild.id}:${officer.userId}`;
      const lastCheck = trafficStopCheckinSent.get(key) || 0;

      // Only send one check-in per minute at most
      if (Date.now() - lastCheck < 58 * 1000) continue;

      // Determine where to send the check-in
      const targetChannelId = officer.trafficStopChannelId || config.trafficStopChannelIds?.[0];
      if (!targetChannelId) continue;

      const targetChannel = guild.channels.cache.get(targetChannelId) ||
        await guild.channels.fetch(targetChannelId).catch(() => null);
      if (!targetChannel) continue;

      trafficStopCheckinSent.set(key, Date.now());

      const minutesIn = officer.trafficStopStartAt
        ? Math.floor((Date.now() - new Date(officer.trafficStopStartAt).getTime()) / 60000)
        : null;

      const embed = new EmbedBuilder()
        .setColor('#FF8C00')
        .setTitle('Traffic Stop Check-In')
        .setDescription(
          `<@${officer.userId}>, are you still on the traffic stop${officer.subject ? ` with **${officer.subject}**` : ''}?\n\n` +
          (minutesIn !== null ? `You have been on this stop for **${minutesIn} minute${minutesIn !== 1 ? 's' : ''}**.\n\n` : '') +
          `Please confirm your status or clear when finished.`
        )
        .setFooter({ text: 'RPM • Dispatch Auto Check-In' })
        .setTimestamp();

      const stillOnBtn = new ButtonBuilder()
        .setCustomId(`dispatch_stop_still_${officer.userId}`)
        .setLabel('Still on Stop')
        .setStyle(ButtonStyle.Primary);

      const clearBtn = new ButtonBuilder()
        .setCustomId(`dispatch_stop_clear_${officer.userId}`)
        .setLabel('10-8 — Stop Clear')
        .setStyle(ButtonStyle.Success);

      await targetChannel.send({
        content: `<@${officer.userId}>`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(stillOnBtn, clearBtn)],
      }).catch(() => {});

      console.log(`[Dispatch] Traffic stop check-in sent for ${officer.username} in ${guild.name}`);
    }

    // Clean up stale keys for officers no longer on a stop
    for (const [key] of trafficStopCheckinSent) {
      const [gId, uId] = key.split(':');
      if (gId !== guild.id) continue;
      const stillOn = onStopOfficers.some(o => o.userId === uId);
      if (!stillOn) trafficStopCheckinSent.delete(key);
    }
  } catch (err) {
    console.error('[Dispatch] checkTrafficStops error:', err.message);
  }
}

export function startTrafficStopCheckTimer(guild) {
  if (trafficStopCheckIntervals.has(guild.id)) return;
  const interval = setInterval(() => checkTrafficStops(guild), 60 * 1000);
  trafficStopCheckIntervals.set(guild.id, interval);
  console.log(`[Dispatch] Traffic stop check-in timer started for ${guild.name}`);
}

export async function handleStopStillButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_stop_still_', '');
    const isSelf = interaction.user.id === targetUserId;

    const embed = new EmbedBuilder()
      .setColor('#FF8C00')
      .setTitle('Traffic Stop — Still Active')
      .setDescription(
        isSelf
          ? `<@${targetUserId}> confirmed they are **still on the traffic stop**. Dispatch is aware.`
          : `<@${interaction.user.id}> confirmed that <@${targetUserId}> is **still on the traffic stop**.`
      )
      .setFooter({ text: 'RPM • Dispatch' })
      .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
  } catch (err) {
    console.error('[Dispatch] Stop still button error:', err.message);
    interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// STATUS REMINDER TIMER (every 10 minutes)
// ────────────────────────────────────────────────────────────────────────────
const statusReminderIntervals = new Map();
const STATUS_REMINDER_MS = 10 * 60 * 1000;

async function checkStatusReminders(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled || !config.dispatchChannelId || !config.patrolChannelIds?.length) return;

    const needsReminder = [];

    for (const channelId of config.patrolChannelIds) {
      const ch = guild.channels.cache.get(channelId) ||
        await guild.channels.fetch(channelId).catch(() => null);
      if (!ch) continue;

      for (const [, voiceMember] of ch.members) {
        if (voiceMember.user.bot) continue;

        const status = await OfficerStatus.findOne({ guildId: guild.id, userId: voiceMember.id });

        // Remind if no status record, or status is not a clear active/busy code
        const hasGoodStatus = status && ['10-8', '10-6', '10-11', '10-80', '10-97', '10-78'].includes(status.tenCode);
        if (!hasGoodStatus) {
          needsReminder.push(voiceMember);
        }
      }
    }

    if (needsReminder.length === 0) return;

    const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
      await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
    if (!dispatchCh?.isTextBased()) return;

    const mentions = needsReminder.map(m => `<@${m.id}>`).join(', ');

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Status Update Reminder')
      .setDescription(
        `${mentions}\n\n` +
        `Please remember to update your current status on the radio.\n` +
        `If you are available, say **"Dispatch, 10-8"** or use the quick-status button below.\n` +
        `If you are busy, say **"Dispatch, 10-6"**.`
      )
      .setFooter({ text: 'RPM • Auto Status Reminder' })
      .setTimestamp();

    const available10_8 = new ButtonBuilder()
      .setCustomId('dispatch_quick_10_8')
      .setLabel('10-8 — Available')
      .setStyle(ButtonStyle.Success);

    const busy10_6 = new ButtonBuilder()
      .setCustomId('dispatch_quick_10_6')
      .setLabel('10-6 — Busy')
      .setStyle(ButtonStyle.Secondary);

    await dispatchCh.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(available10_8, busy10_6)],
    }).catch(() => {});

    console.log(`[Dispatch] Status reminder sent to ${needsReminder.length} officer(s) in ${guild.name}`);
  } catch (err) {
    console.error('[Dispatch] checkStatusReminders error:', err.message);
  }
}

export function startStatusReminderTimer(guild) {
  if (statusReminderIntervals.has(guild.id)) return;
  const interval = setInterval(() => checkStatusReminders(guild), STATUS_REMINDER_MS);
  statusReminderIntervals.set(guild.id, interval);
  console.log(`[Dispatch] Status reminder timer started for ${guild.name}`);
}

export async function handleQuickStatusButton(interaction) {
  try {
    const code = interaction.customId === 'dispatch_quick_10_8' ? '10-8' : '10-6';
    const officerName = interaction.member.displayName || interaction.user.username;
    const guildId = interaction.guildId;

    await updateOfficerStatus(guildId, interaction.user.id, officerName, code,
      { code, codeInfo: TEN_CODES[code], subject: null, location: null, rawText: `Quick status: ${code}` },
      null
    );

    const config = await DispatchConfig.findOne({ guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const label = code === '10-8' ? '10-8 — Available' : '10-6 — Busy';
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setDescription(`<@${interaction.user.id}> is now showing **${label}**. Status board updated.`)
      .setFooter({ text: 'RPM • Dispatch' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    console.error('[Dispatch] Quick status button error:', err.message);
    interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CALL REPEAT TIMER (existing, unchanged below)
// ────────────────────────────────────────────────────────────────────────────
const lastReminderAt = new Map();
const REPEAT_DELAY_MS = 2 * 60 * 1000;
const REMINDER_INTERVAL_MS = 2 * 60 * 1000;
const repeatIntervals = new Map();

async function checkUnrespondedCalls(guild, client) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled) return;

    const cutoff = new Date(Date.now() - REPEAT_DELAY_MS);
    const unrespondedCalls = await EmergencyCall.find({
      guildId: guild.id,
      status: 'active',
      $or: [{ respondingLeoId: { $exists: false } }, { respondingLeoId: null }],
      attachedLeoIds: { $size: 0 },
      timestamp: { $lte: cutoff },
    });

    for (const call of unrespondedCalls) {
      const lastReminder = lastReminderAt.get(call.callId) || 0;
      if (Date.now() - lastReminder < REMINDER_INTERVAL_MS) continue;
      lastReminderAt.set(call.callId, Date.now());

      const callNum = call.callId?.split('-').pop() || 'unknown';
      console.log(`[Dispatch] Repeating unresponded 911 call #${callNum} for ${guild.name}`);

      const dispatchChannel = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
      if (dispatchChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('911 Call Reminder — No Units Responding')
          .setDescription(
            `**Call #${callNum}** has had no response for over 2 minutes.\n\n` +
            (call.issue ? `**Issue:** ${call.issue}\n` : '') +
            (call.location ? `**Location:** ${call.location}\n` : '') +
            (call.suspectsDescription ? `**Suspects:** ${call.suspectsDescription}\n` : '') +
            `\n**Any available unit, please respond.**`
          )
          .setFooter({ text: 'RPM' })
          .setTimestamp();
        await dispatchChannel.send({ embeds: [embed] }).catch(() => {});
      }

      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice, getDispatchState } = await import('../utils/voiceListener.js');
          const state = getDispatchState?.(guild.id);
          if (state?.connection) {
            let ttsText = `Attention all units, reminder, we still have an active 911 call with no responding units. `;
            if (call.issue) ttsText += `${call.issue}. `;
            if (call.location) ttsText += `Location: ${call.location}. `;
            ttsText += `Any available unit, please respond.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          }
        } catch (err) {
          console.error(`[Dispatch] Failed to repeat 911 call #${callNum} TTS:`, err.message);
        }
      }
    }

    for (const [callId] of lastReminderAt) {
      const stillActive = unrespondedCalls.some(c => c.callId === callId);
      if (!stillActive) lastReminderAt.delete(callId);
    }
  } catch (err) {
    console.error(`[Dispatch] checkUnrespondedCalls error:`, err.message);
  }
}

export function startCallRepeatTimer(guild, client) {
  if (repeatIntervals.has(guild.id)) return;
  const interval = setInterval(() => checkUnrespondedCalls(guild, client), 60 * 1000);
  repeatIntervals.set(guild.id, interval);
  console.log(`[Dispatch] 911 repeat timer started for ${guild.name}`);
}

export async function initDispatchForGuild(guild, client) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config || !config.enabled || config.patrolChannelIds.length === 0) return;

    const { isPremiumGuild } = await import('../utils/premiumCheck.js');
    const premium = await isPremiumGuild(guild.id);
    if (!premium) {
      console.log(`[Dispatch] Skipping AI dispatch for ${guild.name} — not premium`);
      return;
    }

    const { setupDispatchForGuild, moveToChannel } = await import('../utils/voiceListener.js');
    const cadConfig = await CADConfig.findOne({ guildId: guild.id });
    const leoRoleIds = config.leoRoleIds?.length > 0 ? config.leoRoleIds : (cadConfig?.leoRoleIds ?? []);

    const options = {
      onTranscription: (wavBuffer, userId) => processVoiceCall(wavBuffer, userId, guild, client),
      userFilter: async (userId) => {
        if (!leoRoleIds.length) return true;
        const member = await guild.members.fetch(userId).catch(() => null);
        return member?.roles.cache.some(r => leoRoleIds.includes(r.id)) ?? false;
      },
    };

    let joinAudioBuffer = null;
    try {
      joinAudioBuffer = await generateDispatchTTS('Dispatch online, ready to serve.');
      console.log(`[Dispatch] Pre-generated join TTS (${joinAudioBuffer.length} bytes) for ${guild.name}`);
    } catch (err) {
      console.error(`[Dispatch] Failed to pre-generate join TTS for ${guild.name}:`, err.message);
    }

    setupDispatchForGuild(guild.id, config.patrolChannelIds, options, joinAudioBuffer);

    for (const channelId of config.patrolChannelIds) {
      const channel = guild.channels.cache.get(channelId) ||
        await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) continue;

      const hasLeo = leoRoleIds.length === 0
        ? channel.members.some(m => !m.user.bot)
        : channel.members.some(m => m.roles.cache.some(r => leoRoleIds.includes(r.id)));

      if (hasLeo) {
        await moveToChannel(channel);
        break;
      }
    }

    startCallRepeatTimer(guild, client);
    startTrafficStopCheckTimer(guild);
    startStatusReminderTimer(guild);
  } catch (err) {
    console.error(`[Dispatch] initDispatchForGuild error for ${guild.name}:`, err.message);
  }
}
