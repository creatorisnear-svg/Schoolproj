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
import Priority from '../models/Priority.js';
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
  '10-19': { label: '10-19 Return to Station', action: null },
  '10-50': { label: '10-50 Accident', action: null },
  '10-52': { label: '10-52 EMS Requested', action: null },
  '10-31': { label: '10-31 Crime in Progress', action: null },
};

const pendingStopMoveRequests = new Map();

function getPendingStopMoveKey(guildId, officerId) {
  return `${guildId}:${officerId}`;
}

function detectStopMoveAnswer(text) {
  const lower = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(?:yes|yeah|yep|affirmative|10\s*4|ten\s*four|copy|move\s+(?:us|me|them)|go\s+ahead|do\s+it)\b/i.test(lower)) return true;
  if (/\b(?:no|negative|stay|hold|do\s+not\s+move|don'?t\s+move|stay\s+here|keep\s+us\s+here)\b/i.test(lower)) return false;
  return null;
}

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

function detectWarrantCheck(text) {
  const lower = text.toLowerCase().trim();
  const patterns = [
    /(?:check|run|do\s+we\s+have|any|pull)\s+warrants?\s+(?:on|for)\s+(.+)/i,
    /warrants?\s+(?:on|for)\s+(.+)/i,
    /is\s+(.+?)\s+wanted/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m?.[1]) return m[1].trim().replace(/[.,!?]+$/g, '');
  }
  return null;
}

function detectSerialLookup(text) {
  const lower = text.toLowerCase().trim();
  const patterns = [
    /run\s+(?:the\s+)?(?:gun\s+)?serial\s+(?:number\s+)?([a-z0-9]{2,15})/i,
    /check\s+(?:the\s+)?(?:gun\s+)?serial\s+(?:number\s+)?([a-z0-9]{2,15})/i,
    /serial\s+(?:number\s+)?(?:is\s+)?([a-z0-9]{2,15})\s+(?:run|check|look)/i,
    /(?:run|check)\s+(?:a\s+)?(?:gun\s+)?serial\s+([a-z0-9]{2,15})/i,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m?.[1]) {
      const serial = m[1].trim().toUpperCase();
      if (serial.length >= 2 && serial.length <= 15) return serial;
    }
  }
  return null;
}

function detectBackupRequest(text) {
  const lower = text.toLowerCase().trim();
  if (/\b(?:need(?:ing)?\s+backup|requesting\s+(?:backup|additional\s+units?)|request\s+(?:a\s+)?backup|send\s+(?:backup|additional\s+units?|another\s+unit)|i\s+need\s+(?:another\s+unit|additional\s+units?)|need\s+additional\s+units?)\b/i.test(lower)) {
    const locMatch = lower.match(/\bat\s+(.{2,40}?)(?:\s*$)/i);
    return { requested: true, location: locMatch?.[1]?.trim() || null };
  }
  return null;
}

function detectCodeFour(text) {
  return /\b(?:code\s+(?:4|four)|all\s+clear|scene\s+is\s+(?:clear|secure|all\s+clear)|everything(?:'s|\s+is)\s+(?:clear|code\s+(?:4|four))|i(?:'m|m)\s+(?:clear|code\s+(?:4|four))|we(?:'re|\s+are)\s+(?:clear|code\s+(?:4|four)))\b/i.test(text);
}

function detectUnitsCheck(text) {
  return /\b(?:how\s+many\s+(?:units?|officers?)|(?:who(?:'s|\s+is)\s+)?(?:units?\s+)?available\??|what\s+units?\s+(?:are\s+)?(?:available|on\s+duty)|(?:list|show\s+me)\s+(?:available\s+)?(?:units?|officers?)|units?\s+on\s+duty|who(?:'s|\s+is)\s+on\s+duty|how\s+many\s+(?:cops?|units?)\s+(?:are\s+)?(?:out|on\s+duty))\b/i.test(text);
}

function detectEMSRequest(text) {
  const lower = text.toLowerCase().trim();
  const withLoc = lower.match(/\b(?:send|need|request)\s+(?:an?\s+)?(?:(ems|ambulance|medic(?:al)?(?:\s+unit)?|fire(?:\s+department)?|fire(?:men|fighters)?))\s+(?:to|at)\s+(.{2,40}?)(?:\s*$)/i);
  if (withLoc) {
    const type = /fire/i.test(withLoc[1]) ? 'fire' : 'ems';
    return { type, location: withLoc[2].trim() };
  }
  const withoutLoc = lower.match(/\b(?:need|send|request)\s+(?:an?\s+)?(?:(ems|ambulance|medic|fire))\b/i);
  if (withoutLoc) {
    const type = /fire/i.test(withoutLoc[1]) ? 'fire' : 'ems';
    return { type, location: null };
  }
  return null;
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
  // 10-19 — Return to Station
  [/\b(?:returning\s+to\s+(?:the\s+)?station|heading\s+back\s+to\s+(?:the\s+)?station|going\s+(?:back\s+to\s+)?(?:the\s+)?station|back\s+to\s+(?:the\s+)?station)\b/i, '10-19'],
  // 10-50 — Accident
  [/\b(?:vehicle\s+accident|traffic\s+accident|crash(?:ed)?|accident\s+(?:at|on|near)|we\s+have\s+an?\s+accident|reporting\s+an?\s+accident)\b/i, '10-50'],
  // 10-52 — EMS Requested (natural phrases without a location)
  [/\b(?:need\s+(?:an?\s+)?(?:ambulance|ems|medic(?:al)?)|requesting\s+(?:an?\s+)?(?:ambulance|ems|medics?)|send\s+(?:an?\s+)?(?:ambulance|ems|medics?))\b/i, '10-52'],
  // 10-31 — Crime in Progress
  [/\b(?:crime\s+in\s+progress|robbery\s+in\s+progress|shots?\s+fired\s+(?:at|on|near)|burglary\s+in\s+progress|suspect\s+is\s+(?:running|fleeing|armed))\b/i, '10-31'],
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
  let location = locationMatch ? locationMatch[1].trim() : null;

  // Fallback: "show me [code]" pattern (after normalization handles the number)
  const showMeMatch = lower.match(/show\s+me\s+(?:(?:in|on|as|a)\s+)?(\d{2}[-\s]\d{1,2})/i);
  if (!detectedCode && showMeMatch) {
    const raw = showMeMatch[1].replace(/\s/, '-');
    const candidate = `10-${raw.split('-')[1] || raw}`;
    if (TEN_CODES[candidate]) detectedCode = candidate;
  }

  if (!location && !detectedCode) {
    const showMeLocationMatch = lower.match(/\bshow\s+me\s+(?!(?:10|ten)\b)(?:at\s+|on\s+|near\s+|by\s+|off\s+|in\s+)?([a-z0-9][a-z0-9/'&\-\s]{1,40}?)(?:\s*$)/i);
    if (showMeLocationMatch) {
      const candidate = showMeLocationMatch[1].trim();
      if (!/^(?:available|busy|out\s+of\s+service|on\s+scene|clear|back|copy|responding|en\s+route)$/i.test(candidate)) {
        location = candidate;
      }
    }
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
    location,
    rawText: text.trim(),
  };
}

const WHISPER_PROMPT =
  'Police radio communication. Common terms: dispatch, 10-4, 10-7, 10-8, 10-11, 10-19, 10-20, 10-31, 10-50, 10-52, 10-78, 10-80, 10-97, 10-99, ' +
  'traffic stop, show me in, show me on, available, out of service, in pursuit, on scene, run the plate, run the name, ' +
  'check warrants on, run serial number, requesting backup, need backup, units available, code four, all clear, ' +
  'send EMS, send fire, accident on scene, crime in progress, pulling over, officer down, copy that.';

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

async function handlePendingStopMoveVoiceAnswer(guild, config, member, transcript) {
  const key = getPendingStopMoveKey(guild.id, member.id);
  const request = pendingStopMoveRequests.get(key);
  if (!request) return false;

  if (Date.now() > request.expiresAt) {
    pendingStopMoveRequests.delete(key);
    return false;
  }

  const approve = detectStopMoveAnswer(transcript);
  if (approve === null) return false;

  pendingStopMoveRequests.delete(key);

  // ── Acknowledge IMMEDIATELY so officer hears it without any processing delay ──
  if (config?.aiEnabled && hasAIKey()) {
    try {
      const { playDispatchVoice } = await import('../utils/voiceListener.js');
      const ackText = approve
        ? `Copy ${request.officerName}, ten four — moving you now.`
        : `Copy ${request.officerName}, ten four — keeping you where you are.`;
      const ackBuffer = await generateDispatchTTS(ackText);
      playDispatchVoice(guild.id, ackBuffer);
    } catch (err) {
      console.error('[Dispatch TTS] Stop move immediate ack error:', err.message);
    }
  }

  // ── Now do all the processing ─────────────────────────────────────────────
  const civMember = request.targetId
    ? await guild.members.fetch(request.targetId).catch(() => null)
    : request.targetName
      ? await findMemberByName(guild, request.targetName)
      : null;

  const hasCiv = !!(civMember || request.targetName);

  const dispatchCh = request.dispatchChannelId
    ? guild.channels.cache.get(request.dispatchChannelId) || await guild.channels.fetch(request.dispatchChannelId).catch(() => null)
    : null;

  if (!approve) {
    if (dispatchCh?.isTextBased() && request.messageId) {
      const msg = await dispatchCh.messages.fetch(request.messageId).catch(() => null);
      if (msg) {
        let declinedDesc = `**Officer:** <@${request.officerId}>\n`;
        if (hasCiv) {
          declinedDesc += `**With:** ${civMember ? `<@${civMember.id}> (${civMember.displayName || civMember.user.username})` : `**${request.targetName}**`}\n`;
        }
        declinedDesc += `**Move:** Declined by voice\n\nTraffic stop was logged, but no one was moved.`;
        const declinedEmbed = EmbedBuilder.from(msg.embeds[0])
          .setTitle('Traffic Stop Active')
          .setDescription(declinedDesc)
          .setTimestamp();
        await msg.edit({ embeds: [declinedEmbed], components: [] }).catch(() => {});
      }
    }

    await rebuildStatusBoard(guild, config);
    return true;
  }

  if (member.voice?.channelId) {
    await member.voice.setChannel(request.channelId).catch(() => {});
  }

  if (civMember?.voice?.channelId && civMember.voice.channelId !== request.channelId) {
    await civMember.voice.setChannel(request.channelId).catch(() => {});
  }

  await updateOfficerStatus(
    guild.id,
    request.officerId,
    request.officerName,
    '10-11',
    { code: '10-11', codeInfo: TEN_CODES['10-11'], subject: request.targetName || null, location: null, rawText: request.transcript },
    null,
    request.channelId
  );

  await rebuildStatusBoard(guild, config);

  if (dispatchCh?.isTextBased() && request.messageId) {
    const msg = await dispatchCh.messages.fetch(request.messageId).catch(() => null);
    if (msg) {
      let movedDesc = `**Officer:** <@${request.officerId}>\n`;
      if (hasCiv) {
        movedDesc += `**With:** ${civMember ? `<@${civMember.id}> (${civMember.displayName || civMember.user.username})` : `**${request.targetName}**`}\n`;
      }
      movedDesc += `**Moved to:** <#${request.channelId}>\n\n`;
      movedDesc += hasCiv
        ? `Both parties have been moved to the traffic stop channel.\nSay *"10-8"* when the stop is clear.`
        : `Officer has been moved to the traffic stop channel.\nSay *"10-8"* when the stop is clear.`;

      const movedEmbed = EmbedBuilder.from(msg.embeds[0])
        .setTitle('Traffic Stop Active')
        .setDescription(movedDesc)
        .setTimestamp();

      await msg.edit({ embeds: [movedEmbed], components: [] }).catch(() => {});
    }
  }

  return true;
}

const TTS_CACHE_DIR = join(tmpdir(), 'everlink_tts_cache');
const ttsMemCache = new Map();
const TTS_MEM_CACHE_MAX = 30;

try { mkdirSync(TTS_CACHE_DIR, { recursive: true }); } catch {}

const TTS_VOICE = 'autumn';

function ttsCacheKey(text) {
  return createHash('md5').update(`${TTS_VOICE}:${text.toLowerCase().trim()}`).digest('hex');
}

/**
 * Converts numeric 10-codes to their spoken word form so TTS reads them naturally.
 * "10-11" → "ten eleven", not "one zero one one".
 */
const CODE_TO_SPEECH = {
  '10-4': 'ten four', '10-6': 'ten six', '10-7': 'ten seven', '10-8': 'ten eight',
  '10-11': 'ten eleven', '10-12': 'ten twelve', '10-15': 'ten fifteen',
  '10-17': 'ten seventeen', '10-19': 'ten nineteen', '10-20': 'ten twenty',
  '10-31': 'ten thirty one', '10-50': 'ten fifty', '10-52': 'ten fifty two',
  '10-76': 'ten seventy six', '10-78': 'ten seventy eight', '10-80': 'ten eighty',
  '10-97': 'ten ninety seven', '10-99': 'ten ninety nine',
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
  // Strip all action/emote descriptions regardless of bracket style: *text*, (text), [text], <text>
  text = text
    .replace(/\*\*[^*]*\*\*/g, '')   // **double asterisk**
    .replace(/\*[^*]*\*/g, '')        // *single asterisk*
    .replace(/\([^)]*\)/g, '')        // (parentheses)
    .replace(/\[[^\]]*\]/g, '')       // [square brackets]
    .replace(/<[^>]*>/g, '')          // <angle brackets>
    .replace(/\s+/g, ' ')
    .trim();
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
    const voice = provider === 'groq' ? TTS_VOICE : 'nova';
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

  const systemPrompt = `You are a police radio dispatcher in a GTA 5 FiveM RP community. Rules you must follow:\n1. Keep every response to exactly 1 short sentence.\n2. Use 10-codes in responses (ten four, ten eight, etc.).\n3. ONLY acknowledge what the officer explicitly said in this exact transmission. Never assume, infer, or add any information not present in their words.\n4. Never mention calls, locations, suspects, or incidents that the officer did not bring up themselves.\n5. If they mention running a plate or name, reply only: "Copy, say again the plate" or "Copy, say again the name".\n6. Do NOT reference any 911 calls unless listed below AND the officer mentioned responding to a call.\n7. If the officer's message is unclear, just say "Go ahead [name]" or ask them to repeat.\n${callContext ? `Active 911 calls you MAY reference only if the officer asks:\n${callContext}` : 'There are no active 911 calls. Do not mention any calls.'}`;

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
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Officer ${officerName} said: "${callText}"`,
          },
        ],
        max_tokens: 60,
        temperature: 0.5,
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

    // Dedup: ignore identical transcripts from the same user within 8 seconds
    const dedupKey = `${guild.id}:${userId}`;
    const now = Date.now();
    const lastEntry = _transcriptDedup.get(dedupKey);
    const normalized = transcript.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (lastEntry && (now - lastEntry.ts < 8000) && lastEntry.text === normalized) {
      console.log(`[Dispatch] Dedup — ignoring repeated transcript from ${officerName}`);
      return;
    }
    _transcriptDedup.set(dedupKey, { ts: now, text: normalized });

    if (await handlePendingStopMoveVoiceAnswer(guild, config, member, transcript)) return;

    {
      const words = transcript.trim().toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ''));
      const triggers = ['dispatch'];
      const idx = words.findIndex(w => triggers.includes(w));
      if (idx === -1 || idx > 5) {
        console.log(`[Dispatch] Ignored — no trigger word found`);
        return;
      }
      transcript = words.slice(idx + 1).join(' ');
      if (transcript.length < 2) return;
      console.log(`[Dispatch] Cleaned transcript: "${transcript}"`);
    }

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
        const requestKey = getPendingStopMoveKey(guild.id, userId);
        pendingStopMoveRequests.set(requestKey, {
          guildId: guild.id,
          officerId: userId,
          officerName,
          targetName: joinTargetName,
          targetId: civMember?.id || null,
          channelId: bestChannelId,
          transcript,
          createdAt: Date.now(),
          expiresAt: Date.now() + 5 * 60 * 1000,
          dispatchChannelId: null,
          messageId: null,
        });
        setTimeout(() => pendingStopMoveRequests.delete(requestKey), 5 * 60 * 1000);

        await updateOfficerStatus(guild.id, userId, officerName, '10-11',
          { code: '10-11', codeInfo: TEN_CODES['10-11'], subject: joinTargetName, location: null, rawText: transcript },
          null, null);

        const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

        if (dispatchCh?.isTextBased()) {
          const civLine = civMember
            ? `<@${civMember.id}> (${civMember.displayName || civMember.user.username})`
            : `**${joinTargetName}**`;

          const stopEmbed = new EmbedBuilder()
            .setColor('#2d2d2d')
            .setTitle('Traffic Stop Move Request')
            .setDescription(
              `**Officer:** <@${userId}>\n` +
              `**With:** ${civLine}\n` +
              `**Suggested Channel:** <#${bestChannelId}>\n\n` +
              `Awaiting a voice response from <@${userId}>. Say **yes** to move both parties, or **no** to stay where you are.`
            )
            .addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false })
            .setFooter({ text: 'RPM' })
            .setTimestamp();

          const msg = await dispatchCh.send({ embeds: [stopEmbed], components: [] }).catch(() => null);
          const pending = pendingStopMoveRequests.get(requestKey);
          if (pending && msg) {
            pending.dispatchChannelId = dispatchCh.id;
            pending.messageId = msg.id;
          }
        }

        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const civName = civMember?.displayName || civMember?.user?.username || joinTargetName;
            const ttsText = `Copy ${officerName}, showing you in on the traffic stop with ${civName}. Would you like me to move both parties to the traffic stop channel?`;
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

    // --- "Dispatch help / what can you do / features" detection ---
    const helpPattern = /\b(?:what\s+can\s+you\s+do|dispatch\s+help|help\s+me|what\s+are\s+your\s+features?|what\s+do\s+you\s+do|show\s+(?:me\s+)?(?:your\s+)?features?|list\s+(?:your\s+)?(?:features?|commands?|capabilities))\b/i;
    if (helpPattern.test(transcript)) {
      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsText = [
            `Copy ${officerName}, here is what I can do as your AI dispatch.`,
            `Say ten eleven to initiate a traffic stop and I will move you to an open stop channel.`,
            `Say show me in a ten eleven with followed by a civilian name to start a stop on a specific person.`,
            `Say ten eight when your stop is clear and I will bring you back to patrol.`,
            `Say dispatch run plate followed by the plate number to run a vehicle check.`,
            `Say dispatch run name followed by a name to run a person check.`,
            `Say dispatch stay with me to keep me on your channel for up to ten minutes while you handle your stop.`,
            `Say dispatch attach me to followed by an officer name to move yourself to that officer's traffic stop channel.`,
            `Say ten eighty if you initiate a pursuit and I will broadcast an all units alert and find you backup.`,
            `Say ten ninety nine or officer down and I will send an immediate panic alert to all units.`,
            `Say dispatch check warrants on followed by a name to run a warrant check.`,
            `Say dispatch run serial followed by the serial number to check a firearm registration.`,
            `Say dispatch requesting backup to broadcast an all units backup alert.`,
            `Say dispatch code four or all clear to mark yourself ten eight from a scene.`,
            `Say dispatch units available to hear how many officers are on duty and who is free.`,
            `Say dispatch send EMS to or dispatch send fire to followed by a location to request emergency services.`,
            `I will check on you every minute while you are on scene and call out any officers every ten minutes who have not updated their status.`,
          ].join(' ');
          const ttsBuffer = await generateDispatchTTS(ttsText);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) {
          console.error('[Dispatch TTS] Help TTS error:', err.message);
        }
      }
      return;
    }
    // --- End help detection ---

    // --- Pursuit backup voice response detection ---
    // If there's an active pursuit alert, check if this officer is responding verbally
    const pursuitAlert = activePursuitAlerts.get(guild.id);
    if (pursuitAlert && detectPursuitResponse(transcript)) {
      const responderName = officerName;
      const pursuitChannel = guild.channels.cache.get(pursuitAlert.pursuitChannelId) ||
        await guild.channels.fetch(pursuitAlert.pursuitChannelId).catch(() => null);

      if (pursuitChannel && member?.voice?.channelId) {
        await member.voice.setChannel(pursuitChannel).catch(() => {});
        console.log(`[Dispatch] ${responderName} responding to pursuit — moved to channel "${pursuitChannel.name}"`);

        if (config.dispatchChannelId) {
          const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
          if (dispatchCh?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('10-80 — Unit Responding')
              .setDescription(
                `**<@${userId}> (${responderName})** is responding to the pursuit.\n` +
                `Moved to pursuit channel <#${pursuitAlert.pursuitChannelId}>.`
              )
              .setFooter({ text: 'RPM • Dispatch' })
              .setTimestamp();
            await dispatchCh.send({ embeds: [embed] }).catch(() => {});
          }
        }

        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsText = `Copy ${responderName}, moving you to the pursuit channel to back up ${pursuitAlert.officerName}. Ten four.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch {}
        }

        activePursuitAlerts.delete(guild.id);
        return;
      }
    }
    // --- End pursuit backup detection ---

    // --- "Dispatch, attach me to [officer]'s stop" detection ---
    // The SPEAKER is the one being moved to the named officer's traffic stop channel
    const attachStopPattern = /\b(?:attach|send|move|put)\s+me\s+(?:to|with)\s+(\w+)(?:'s?)?\s+(?:10[-\s]?11|stop|traffic\s+stop|pullover|scene)\b/i;
    const attachStopMatch = transcript.match(attachStopPattern);
    if (attachStopMatch) {
      const sceneName = attachStopMatch[1].toLowerCase(); // officer on scene

      // Find the scene officer's active stop channel
      const allStatuses = await OfficerStatus.find({ guildId: guild.id, tenCode: '10-11' });
      const sceneOfficer = allStatuses.find(s =>
        s.username.toLowerCase().includes(sceneName) || sceneName.includes(s.username.toLowerCase())
      );
      const stopChannelId = sceneOfficer?.trafficStopChannelId;

      if (sceneOfficer && stopChannelId && member?.voice?.channelId) {
        const stopCh = guild.channels.cache.get(stopChannelId) ||
          await guild.channels.fetch(stopChannelId).catch(() => null);
        if (stopCh) {
          await member.voice.setChannel(stopCh).catch(() => {});
          console.log(`[Dispatch] Attached ${officerName} to ${sceneOfficer.username}'s stop in channel "${stopCh.name}"`);

          if (config.aiEnabled && hasAIKey()) {
            try {
              const { playDispatchVoice } = await import('../utils/voiceListener.js');
              const ttsText = `Copy ${officerName}, moving you to ${sceneOfficer.username}'s traffic stop. Ten four.`;
              const ttsBuffer = await generateDispatchTTS(ttsText);
              playDispatchVoice(guild.id, ttsBuffer);
            } catch {}
          }
          return;
        }
      } else {
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsText = `Unable to find an active traffic stop for ${sceneName}. Please verify the officer name and try again.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch {}
        }
        return;
      }
    }
    // --- End attach-to-stop detection ---

    // --- "Stay with me / stay on channel" detection ---
    // Officer asks dispatch to remain in their traffic stop channel
    const stayPattern = /\b(?:stay(?:\s+(?:with\s+me|on\s+(?:my\s+)?channel|here|on\s+this\s+channel))?|keep\s+(?:dispatch\s+)?(?:with\s+me|on\s+(?:this\s+)?channel|here)|i\s+need\s+(?:you|dispatch)\s+(?:to\s+)?stay)\b/i;
    if (stayPattern.test(transcript)) {
      const officerVoiceChannelId = member?.voice?.channelId;
      const officerStatus = await OfficerStatus.findOne({ guildId: guild.id, userId });
      const isOnStop = officerStatus?.tenCode === '10-11';

      // Only valid if the officer is on a traffic stop and in a non-patrol channel
      const { getDispatchState, setExtendedStay, getCurrentChannelId } = await import('../utils/voiceListener.js');
      const dispatchState = getDispatchState(guild.id);
      const currentDispatchChannelId = getCurrentChannelId(guild.id);
      const isInStopChannel = officerVoiceChannelId &&
        currentDispatchChannelId === officerVoiceChannelId &&
        !config.patrolChannelIds?.includes(currentDispatchChannelId);

      if ((isOnStop || isInStopChannel) && officerVoiceChannelId) {
        // Extract duration if specified: "stay with me for 5 minutes"
        const durationMatch = transcript.match(/for\s+(\d+)\s+(?:minute|min)/i);
        const durationMin = durationMatch ? Math.min(parseInt(durationMatch[1]), 10) : 5;
        const durationMs = durationMin * 60 * 1000;

        // Find the patrol channel to return to later
        const patrolChannelId = config.patrolChannelIds?.[0];

        // Add the stop channel to patrol set so the bot can stay and listen
        if (dispatchState && officerVoiceChannelId) {
          dispatchState.patrolChannelIds.add(officerVoiceChannelId);
          setExtendedStay(guild.id, officerVoiceChannelId, durationMs, patrolChannelId);
        }

        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsText = `Copy ${officerName}, dispatch will stay on your channel for ${durationMin} minute${durationMin !== 1 ? 's' : ''}. Go ahead with your traffic stop.`;
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) {
            console.error('[Dispatch TTS] Stay-with-me TTS error:', err.message);
          }
        }

        if (config.dispatchChannelId) {
          const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
          if (dispatchCh?.isTextBased()) {
            const stayEmbed = new EmbedBuilder()
              .setColor('#2d2d2d')
              .setTitle('Dispatch On Channel')
              .setDescription(
                `**Officer:** <@${userId}>\n` +
                `Dispatch will remain on <@${userId}>'s traffic stop channel for **${durationMin} minute${durationMin !== 1 ? 's' : ''}**.\n` +
                `-# Officers can run plates or names during this time.`
              )
              .setFooter({ text: 'RPM • Dispatch' })
              .setTimestamp();
            await dispatchCh.send({ embeds: [stayEmbed] }).catch(() => {});
          }
        }
        return;
      }
    }
    // --- End stay-with-me detection ---

    // --- Warrant check detection ---
    const warrantTarget = detectWarrantCheck(transcript);
    if (warrantTarget) {
      console.log(`[Dispatch] Warrant check detected for "${warrantTarget}" by ${officerName}`);
      const result = await runCADLookup(guild.id, { type: 'name', query: warrantTarget });

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

      if (dispatchCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Warrant Check')
          .setFooter({ text: 'RPM' })
          .setTimestamp()
          .addFields(
            { name: 'Requested By', value: `<@${userId}>`, inline: true },
            { name: 'Subject', value: warrantTarget, inline: true },
          );
        if (result.found) {
          const isWanted = result.embed.status === 'WANTED';
          embed.addFields(
            { name: 'Name', value: result.embed.name, inline: true },
            { name: 'Warrant Status', value: isWanted ? '**WANTED** — Active warrants on file' : 'No active warrants', inline: false },
            { name: 'License', value: result.embed.license || 'Unknown', inline: true },
          );
          if (result.embed.age) embed.addFields({ name: 'Age', value: `${result.embed.age}`, inline: true });
          if (result.embed.hasBolo) embed.addFields({ name: 'Active BOLO', value: result.embed.boloReason, inline: false });
        } else {
          embed.addFields({ name: 'Result', value: 'No records found in system', inline: false });
        }
        embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }

      let tts;
      if (!result.found) {
        tts = `Negative ${officerName}, no records found for ${warrantTarget} in the system.`;
      } else if (result.embed.status === 'WANTED') {
        tts = `${officerName}, ${result.embed.name} is showing WANTED. Active warrants on file. Use caution.`;
        if (result.embed.hasBolo) tts += ` Active BOLO on file: ${result.embed.boloReason}.`;
      } else {
        tts = `${officerName}, ${result.embed.name} comes back clear, no active warrants.`;
        if (result.embed.hasBolo) tts += ` Note: active BOLO on this individual. ${result.embed.boloReason}.`;
      }
      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(tts);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] Warrant check error:', err.message); }
      }
      return;
    }
    // --- End warrant check ---

    // --- Firearm serial lookup ---
    const serialQuery = detectSerialLookup(transcript);
    if (serialQuery) {
      console.log(`[Dispatch] Serial lookup: "${serialQuery}" by ${officerName}`);
      const escapedSerial = serialQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const character = await CADCharacter.findOne({
        guildId: guild.id,
        'firearms.serialNumber': { $regex: new RegExp(`^${escapedSerial}$`, 'i') },
      });

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

      let tts;
      if (dispatchCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#2d2d2d')
          .setTitle('Firearm Serial Lookup')
          .setFooter({ text: 'RPM' })
          .setTimestamp()
          .addFields(
            { name: 'Requested By', value: `<@${userId}>`, inline: true },
            { name: 'Serial', value: serialQuery, inline: true },
          );
        if (character) {
          const firearm = character.firearms?.find(f => f.serialNumber?.toUpperCase() === serialQuery);
          const fa = firearm ? `${firearm.make || ''} ${firearm.model || ''}`.trim() || 'Unknown' : 'Unknown';
          embed.addFields(
            { name: 'Registered Owner', value: character.characterName, inline: true },
            { name: 'Firearm', value: fa, inline: true },
            { name: 'Owner Status', value: character.status === 'wanted' ? '**WANTED**' : 'Clean', inline: true },
          );
          tts = `Serial ${serialQuery.split('').join(' ')} comes back registered to ${character.characterName}, ${fa}.`;
          if (character.status === 'wanted') tts += ` Caution, owner is showing WANTED.`;
        } else {
          embed.addFields({ name: 'Result', value: 'No records found — serial not registered in system', inline: false });
          tts = `Serial ${serialQuery.split('').join(' ')} comes back with no records. Firearm is not registered in the system. Use caution.`;
        }
        embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }
      if (tts && config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(tts);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] Serial lookup error:', err.message); }
      }
      return;
    }
    // --- End serial lookup ---

    // --- Backup request detection ---
    const backupReq = detectBackupRequest(transcript);
    if (backupReq) {
      console.log(`[Dispatch] Backup requested by ${officerName}${backupReq.location ? ` at ${backupReq.location}` : ''}`);
      const allStatuses = await OfficerStatus.find({ guildId: guild.id });
      const available = allStatuses.filter(s => s.tenCode === '10-8' && s.userId !== userId);

      await updateOfficerStatus(guild.id, userId, officerName, '10-78',
        { code: '10-78', codeInfo: TEN_CODES['10-78'], subject: null, location: backupReq.location, rawText: transcript },
        null, null);

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

      if (dispatchCh?.isTextBased()) {
        const availText = available.length > 0 ? available.map(o => o.username).join(', ') : 'None showing available';
        const embed = new EmbedBuilder()
          .setColor('#f04747')
          .setTitle('10-78 — Backup Requested')
          .setDescription(
            `**Officer:** <@${userId}>\n` +
            (backupReq.location ? `**Location:** ${backupReq.location}\n` : '') +
            `**Available Units:** ${availText}\n\n` +
            `All available units please respond to <@${userId}>'s location. Say **10-76** to respond.`
          )
          .setFooter({ text: 'RPM • Dispatch' })
          .setTimestamp();
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }

      let tts = `All units, all units. ${officerName} is requesting backup`;
      if (backupReq.location) tts += ` at ${backupReq.location}`;
      tts += '.';
      if (available.length > 0) {
        tts += ` Available units: ${available.map(o => o.username).join(', ')}. Please respond.`;
      } else {
        tts += ' No units currently showing available.';
      }
      tts += ' Say ten seventy six to respond.';

      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(tts);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] Backup request error:', err.message); }
      }
      await rebuildStatusBoard(guild, config);
      return;
    }
    // --- End backup request ---

    // --- Code 4 / scene clear detection ---
    if (detectCodeFour(transcript)) {
      console.log(`[Dispatch] Code 4 / all clear from ${officerName}`);
      await updateOfficerStatus(guild.id, userId, officerName, '10-8',
        { code: '10-8', codeInfo: TEN_CODES['10-8'], subject: null, location: null, rawText: transcript },
        null, null);

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
      if (dispatchCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#43b581')
          .setTitle('Code 4 — Scene Clear')
          .setDescription(`**Officer:** <@${userId}>\nScene is code four. Showing **10-8 Available**.`)
          .setFooter({ text: 'RPM • Dispatch' })
          .setTimestamp();
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }

      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsText = `Copy ${officerName}, code four, scene is clear. Marking you ten eight, available.`;
          const ttsBuffer = await generateDispatchTTS(ttsText);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] Code 4 error:', err.message); }
      }
      await rebuildStatusBoard(guild, config);
      return;
    }
    // --- End code 4 ---

    // --- Units available check ---
    if (detectUnitsCheck(transcript)) {
      console.log(`[Dispatch] Units check requested by ${officerName}`);
      const allStatuses = await OfficerStatus.find({ guildId: guild.id });
      const available = allStatuses.filter(s => s.tenCode === '10-8');
      const onStop = allStatuses.filter(s => s.tenCode === '10-11');
      const inPursuit = allStatuses.filter(s => s.tenCode === '10-80');
      const total = allStatuses.length;

      let tts = `${officerName}, showing ${total} unit${total !== 1 ? 's' : ''} on duty. `;
      if (available.length > 0) {
        tts += `${available.length} available: ${available.map(o => o.username).join(', ')}. `;
      } else {
        tts += 'No units currently showing available. ';
      }
      if (onStop.length > 0) tts += `${onStop.length} on traffic stop. `;
      if (inPursuit.length > 0) tts += `${inPursuit.length} in pursuit. `;

      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(tts);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] Units check error:', err.message); }
      }
      return;
    }
    // --- End units check ---

    // --- EMS / Fire request ---
    const emsReq = detectEMSRequest(transcript);
    if (emsReq) {
      console.log(`[Dispatch] ${emsReq.type.toUpperCase()} request by ${officerName}${emsReq.location ? ` at ${emsReq.location}` : ''}`);
      const serviceLabel = emsReq.type === 'fire' ? 'Fire Department' : 'EMS';
      const serviceColor = emsReq.type === 'fire' ? '#f59e0b' : '#5b9cf6';

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
      if (dispatchCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(serviceColor)
          .setTitle(`${serviceLabel} Requested`)
          .setDescription(
            `**Requesting Officer:** <@${userId}>\n` +
            (emsReq.location ? `**Location:** ${emsReq.location}\n` : '') +
            `\n${serviceLabel} has been requested by <@${userId}>. Please respond to the scene.`
          )
          .setFooter({ text: 'RPM • Dispatch' })
          .setTimestamp();
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }

      let tts = `Copy ${officerName}, requesting ${serviceLabel}`;
      if (emsReq.location) tts += ` to ${emsReq.location}`;
      tts += `. ${serviceLabel}, please respond.`;

      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(tts);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] EMS/Fire error:', err.message); }
      }
      return;
    }
    // --- End EMS / Fire request ---

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
          // Ask via voice before moving — wait for a spoken yes or no
          const requestKey = getPendingStopMoveKey(guild.id, userId);
          pendingStopMoveRequests.set(requestKey, {
            guildId: guild.id,
            officerId: userId,
            officerName,
            targetName: null,
            targetId: null,
            channelId: bestChannelId,
            transcript,
            createdAt: Date.now(),
            expiresAt: Date.now() + 5 * 60 * 1000,
            dispatchChannelId: null,
            messageId: null,
          });
          setTimeout(() => pendingStopMoveRequests.delete(requestKey), 5 * 60 * 1000);

          await updateOfficerStatus(guild.id, userId, officerName, '10-11', parsed, null, null);

          const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

          if (dispatchCh?.isTextBased()) {
            const stopEmbed = new EmbedBuilder()
              .setColor('#2d2d2d')
              .setTitle('Traffic Stop Move Request')
              .setDescription(
                `**Officer:** <@${userId}>\n` +
                `**Suggested Channel:** <#${bestChannelId}>\n\n` +
                `Awaiting a voice response from <@${userId}>. Say **yes** to move to the stop channel, or **no** to stay where you are.`
              )
              .addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false })
              .setFooter({ text: 'RPM' })
              .setTimestamp();

            const msg = await dispatchCh.send({ embeds: [stopEmbed], components: [] }).catch(() => null);
            const pending = pendingStopMoveRequests.get(requestKey);
            if (pending && msg) {
              pending.dispatchChannelId = dispatchCh.id;
              pending.messageId = msg.id;
            }
          }

          if (config.aiEnabled && hasAIKey()) {
            try {
              const { playDispatchVoice } = await import('../utils/voiceListener.js');
              const ttsText = `Copy ${officerName}, showing you in on a ten eleven. Would you like me to move you to the traffic stop channel?`;
              const ttsBuffer = await generateDispatchTTS(ttsText);
              playDispatchVoice(guild.id, ttsBuffer);
            } catch (err) {
              console.error('[Dispatch TTS] Traffic stop voice question error:', err.message);
            }
          }

          await rebuildStatusBoard(guild, config);
        }
      } catch (err) {
        console.error('[Dispatch] Voice channel move error:', err.message);
      }
    } else if (voiceAction === 'available') {
      // Officer called 10-8 verbally — clear their stop status
      await updateOfficerStatus(guild.id, userId, officerName, '10-8', parsed, null);

      // If bot is currently in the stop channel with this officer, move them back to patrol
      try {
        const { getCurrentChannelId, clearExtendedStay, moveToChannel } = await import('../utils/voiceListener.js');
        const currentBotChannelId = getCurrentChannelId(guild.id);
        const officerVoiceChannelId = member?.voice?.channelId;
        const isInStopWithOfficer = currentBotChannelId &&
          officerVoiceChannelId === currentBotChannelId &&
          !config.patrolChannelIds?.includes(currentBotChannelId);

        if (isInStopWithOfficer) {
          clearExtendedStay(guild.id);
          const patrolChannelId = config.patrolChannelIds?.[0];
          if (patrolChannelId) {
            const patrolCh = guild.channels.cache.get(patrolChannelId) ||
              await guild.channels.fetch(patrolChannelId).catch(() => null);
            if (patrolCh) {
              // Move the officer back to patrol first
              await member.voice.setChannel(patrolCh).catch(() => {});
              // Then return bot to patrol
              await moveToChannel(patrolCh).catch(() => {});
            }
          }
          // Acknowledge via TTS
          if (config.aiEnabled && hasAIKey()) {
            try {
              const { playDispatchVoice } = await import('../utils/voiceListener.js');
              const ttsBuffer = await generateDispatchTTS(`Copy ${officerName}, showing you ten eight. Stop is clear, returning you to patrol. Ten four.`);
              playDispatchVoice(guild.id, ttsBuffer);
            } catch {}
          }
        }
      } catch (err) {
        console.error('[Dispatch] 10-8 auto-return error:', err.message);
      }
    } else if (voiceAction === 'out_of_service') {
      await OfficerStatus.deleteOne({ guildId: guild.id, userId }).catch(() => {});
    } else if (parsed.code) {
      const existing = await OfficerStatus.findOne({ guildId: guild.id, userId });
      await updateOfficerStatus(guild.id, userId, officerName, parsed.code, parsed, existing?.lastPatrolChannelId || null);

      // 10-99 — status board updated; no separate channel alert posted

      // 10-80 — Pursuit from traffic stop: broadcast to patrol and ask for backup
      if (parsed.code === '10-80') {
        const { getCurrentChannelId, clearExtendedStay } = await import('../utils/voiceListener.js');
        const currentBotChannelId = getCurrentChannelId(guild.id);
        const officerVoiceChannelId = member?.voice?.channelId;
        const isInStopChannel = currentBotChannelId &&
          officerVoiceChannelId === currentBotChannelId &&
          !config.patrolChannelIds?.includes(currentBotChannelId);

        if (isInStopChannel) {
          await triggerPursuitBroadcast(guild, config, userId, officerName, currentBotChannelId);
          clearExtendedStay(guild.id);
        }
      }
    } else if (parsed.location) {
      const existing = await OfficerStatus.findOne({ guildId: guild.id, userId });
      if (existing?.tenCode) {
        await OfficerStatus.updateOne(
          { guildId: guild.id, userId },
          {
            $set: {
              username: officerName,
              location: parsed.location,
              rawCall: parsed.rawText,
              updatedAt: new Date(),
            },
          }
        );
        console.log(`[Dispatch] Updated location only for ${officerName}: ${parsed.location}`);
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

// Per-user transcript dedup map { guildId:userId → { ts, text } }
const _transcriptDedup = new Map();

// Status category helpers for the board
const SCENE_CODES = new Set(['10-11', '10-97', '10-50', '10-31', '10-52']);
const BUSY_CODES  = new Set(['10-6', '10-7', '10-19']);
const ALERT_CODES = new Set(['10-99', '10-80', '10-78']);
const CODE_PREFIX = {
  '10-8':  '[AVL]',
  '10-11': '[STOP]',
  '10-97': '[SCENE]',
  '10-80': '[PURSUIT]',
  '10-99': '[PANIC]',
  '10-78': '[BACKUP]',
  '10-6':  '[BUSY]',
  '10-7':  '[OOS]',
  '10-19': '[RTB]',
  '10-50': '[ACCIDENT]',
  '10-52': '[EMS REQ]',
  '10-31': '[CRIME]',
};

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

  let priorityData = null;
  try { priorityData = await Priority.findOne({ guildId: guild.id }); } catch {}

  let boloCount = 0;
  try { boloCount = await BOLO.countDocuments({ guildId: guild.id, active: true }); } catch {}

  const embeds = [];

  // Dynamic board color: red if panic active, orange if pursuit, dark otherwise
  const hasPanic    = officers.some(o => o.tenCode === '10-99');
  const hasPursuit  = officers.some(o => o.tenCode === '10-80');
  const hasBackup   = officers.some(o => o.tenCode === '10-78');
  const boardColor  = hasPanic ? '#FF0000' : hasPursuit ? '#FF4500' : hasBackup ? '#f59e0b' : '#2d2d2d';

  const officerEmbed = new EmbedBuilder()
    .setColor(boardColor)
    .setTitle('Officer Status Board')
    .setFooter({ text: 'RPM • Live Dispatch' })
    .setTimestamp();

  // ── Stats summary header ──────────────────────────────────────────────────
  const panicOfficers   = officers.filter(o => o.tenCode === '10-99');
  const pursuitOfficers = officers.filter(o => o.tenCode === '10-80');
  const backupOfficers  = officers.filter(o => o.tenCode === '10-78');
  const sceneOfficers   = officers.filter(o => SCENE_CODES.has(o.tenCode));
  const availOfficers   = officers.filter(o => o.tenCode === '10-8');
  const busyOfficers    = officers.filter(o => BUSY_CODES.has(o.tenCode));
  const otherOfficers   = officers.filter(o =>
    !ALERT_CODES.has(o.tenCode) && !SCENE_CODES.has(o.tenCode) &&
    o.tenCode !== '10-8' && !BUSY_CODES.has(o.tenCode)
  );

  const statLine = [
    `Avail: **${availOfficers.length}**`,
    `On Scene: **${sceneOfficers.length}**`,
    `Busy: **${busyOfficers.length}**`,
    `On Duty: **${officers.length}**`,
  ].join('  ·  ');

  const headerParts = [statLine];

  // Priority panel alert
  if (priorityData?.priorityActive) {
    const since = priorityData.activatedAt
      ? `<t:${Math.floor(new Date(priorityData.activatedAt).getTime() / 1000)}:R>`
      : '';
    headerParts.push(`**PRIORITY ACTIVE** — ${priorityData.priorityIssuedBy || 'Unknown'}${since ? ` · activated ${since}` : ''}`);
  }

  // Priority cooldown
  if (priorityData?.cooldownEndsAt && new Date(priorityData.cooldownEndsAt) > new Date()) {
    const remaining = Math.ceil((new Date(priorityData.cooldownEndsAt) - Date.now()) / 60000);
    headerParts.push(`**Priority Cooldown:** ${remaining} min remaining — issued by ${priorityData.cooldownIssuedBy || 'Unknown'}`);
  }

  // Active BOLO count
  if (boloCount > 0) {
    headerParts.push(`**${boloCount} Active BOLO${boloCount !== 1 ? 's' : ''}** on file`);
  }

  // Unresponded 911 warnings
  const unresponded = activeCalls.filter(c => !c.respondingLeoId && (!c.attachedLeoIds || c.attachedLeoIds.length === 0));
  if (unresponded.length > 0) {
    headerParts.push(`**${unresponded.length} UNRESPONDED CALL${unresponded.length !== 1 ? 'S' : ''}** — Units needed!`);
  }

  // ── Officer row builder ───────────────────────────────────────────────────
  const buildRow = (o) => {
    const codeLabel = TEN_CODES[o.tenCode]?.label || o.tenCode;
    const prefix    = CODE_PREFIX[o.tenCode] || `[${o.tenCode}]`;
    const since     = `<t:${Math.floor(new Date(o.updatedAt).getTime() / 1000)}:R>`;

    let line = `**${prefix}** <@${o.userId}> — **${codeLabel}**`;
    if (o.subject)              line += `\n   ╟ Subject: ${o.subject}`;
    if (o.location)             line += `\n   ╟ Location: ${o.location}`;
    if (o.trafficStopChannelId) line += `\n   ╟ Channel: <#${o.trafficStopChannelId}>`;

    if ((SCENE_CODES.has(o.tenCode) || ALERT_CODES.has(o.tenCode)) && o.trafficStopStartAt) {
      const mins = Math.floor((Date.now() - new Date(o.trafficStopStartAt).getTime()) / 60000);
      if (mins > 0) line += `\n   ╟ On scene: **${mins} min**`;
    }

    line += `\n   ╙ Updated: ${since}`;

    const attachedCall = activeCalls.find(c =>
      c.respondingLeoId === o.userId || c.attachedLeoIds?.includes(o.userId)
    );
    if (attachedCall) {
      const role = attachedCall.respondingLeoId === o.userId ? 'PRIMARY' : 'ATTACHED';
      const num  = attachedCall.callId?.split('-').pop() || '???';
      line += `  ·  Call #${num} [${role}]`;
    }

    return line;
  };

  // ── Build sections in priority order ─────────────────────────────────────
  const sections = [];

  if (panicOfficers.length > 0)
    sections.push(`**━━ OFFICER DOWN / PANIC (${panicOfficers.length}) ━━**\n` + panicOfficers.map(buildRow).join('\n\n'));

  if (pursuitOfficers.length > 0)
    sections.push(`**━━ PURSUIT ACTIVE (${pursuitOfficers.length}) ━━**\n` + pursuitOfficers.map(buildRow).join('\n\n'));

  if (backupOfficers.length > 0)
    sections.push(`**━━ BACKUP REQUESTED (${backupOfficers.length}) ━━**\n` + backupOfficers.map(buildRow).join('\n\n'));

  const accidentOfficers = sceneOfficers.filter(o => o.tenCode === '10-50');
  if (accidentOfficers.length > 0)
    sections.push(`**━━ ACCIDENT SCENE (${accidentOfficers.length}) ━━**\n` + accidentOfficers.map(buildRow).join('\n\n'));

  const crimeOfficers = sceneOfficers.filter(o => o.tenCode === '10-31');
  if (crimeOfficers.length > 0)
    sections.push(`**━━ CRIME IN PROGRESS (${crimeOfficers.length}) ━━**\n` + crimeOfficers.map(buildRow).join('\n\n'));

  const emsReqOfficers = sceneOfficers.filter(o => o.tenCode === '10-52');
  if (emsReqOfficers.length > 0)
    sections.push(`**━━ EMS REQUESTED (${emsReqOfficers.length}) ━━**\n` + emsReqOfficers.map(buildRow).join('\n\n'));

  const generalSceneOfficers = sceneOfficers.filter(o => !['10-50', '10-31', '10-52'].includes(o.tenCode));
  if (generalSceneOfficers.length > 0)
    sections.push(`**━━ ON SCENE (${generalSceneOfficers.length}) ━━**\n` + generalSceneOfficers.map(buildRow).join('\n\n'));

  if (availOfficers.length > 0)
    sections.push(`**━━ AVAILABLE (${availOfficers.length}) ━━**\n` + availOfficers.map(buildRow).join('\n\n'));

  if (busyOfficers.length > 0)
    sections.push(`**━━ BUSY / OOS (${busyOfficers.length}) ━━**\n` + busyOfficers.map(buildRow).join('\n\n'));

  if (otherOfficers.length > 0)
    sections.push(`**━━ OTHER (${otherOfficers.length}) ━━**\n` + otherOfficers.map(buildRow).join('\n\n'));

  const officerSection = sections.length > 0 ? sections.join('\n\n') : '*No officers currently on duty.*';
  const fullDesc = headerParts.join('\n') + '\n\n' + officerSection;
  officerEmbed.setDescription(fullDesc.slice(0, 4096));
  embeds.push(officerEmbed);

  // ── Active 911 Calls embed ────────────────────────────────────────────────
  if (activeCalls.length > 0) {
    const callEmbed = new EmbedBuilder()
      .setColor(unresponded.length > 0 ? '#FF4500' : '#2d2d2d')
      .setTitle(`Active 911 Calls (${activeCalls.length})`)
      .setTimestamp();

    const callRows = activeCalls.map(c => {
      const since   = `<t:${Math.floor(new Date(c.timestamp).getTime() / 1000)}:R>`;
      const callNum = c.callId?.split('-').pop() || '???';
      const noUnits = !c.respondingLeoId && (!c.attachedLeoIds || c.attachedLeoIds.length === 0);
      const ageMinutes = Math.floor((Date.now() - new Date(c.timestamp).getTime()) / 60000);

      let line = `**Call #${callNum}** · ${since}${noUnits ? ' — **NO UNITS**' : ''}`;
      if (ageMinutes > 0) line += ` · **${ageMinutes}m old**`;
      if (c.issue)    line += `\n┣ Issue: ${c.issue}`;
      if (c.location) line += `\n┣ Location: ${c.location}`;
      if (c.suspectsDescription) line += `\n┣ Suspects: ${c.suspectsDescription}`;

      if (c.respondingLeoId)    line += `\n┣ Primary: <@${c.respondingLeoId}>`;
      const attached = (c.attachedLeoIds || []).filter(id => id !== c.respondingLeoId);
      if (attached.length > 0)  line += `\n┣ Attached: ${attached.map(id => `<@${id}>`).join(', ')}`;
      if (noUnits)               line += `\n┗ No units responding`;
      else                       line += `\n┗ Units on scene`;

      return line;
    });

    callEmbed.setDescription(callRows.join('\n\n').slice(0, 4096));
    embeds.push(callEmbed);
  }

  // ── Active BOLOs embed ────────────────────────────────────────────────────
  if (boloCount > 0) {
    let activeBOLOs = [];
    try {
      activeBOLOs = await BOLO.find({ guildId: guild.id, active: true })
        .sort({ createdAt: -1 }).limit(8);
    } catch {}

    if (activeBOLOs.length > 0) {
      const boloEmbed = new EmbedBuilder()
        .setColor('#faa61a')
        .setTitle(`Active BOLOs (${boloCount})`)
        .setFooter({ text: 'RPM • CAD' })
        .setTimestamp();

      const boloRows = activeBOLOs.map(b => {
        const num     = b.boloId?.split('-').pop() || '???';
        const issued  = `<t:${Math.floor(new Date(b.createdAt).getTime() / 1000)}:R>`;
        let line = `**BOLO #${num}** — **${b.characterName}** · ${issued}`;
        line += `\n┣ Reason: ${b.reason}`;
        if (b.description) line += `\n┣ Description: ${b.description}`;
        const veh = b.vehicles?.[0];
        if (veh) {
          const vehStr = [veh.year, veh.color, veh.make, veh.model].filter(Boolean).join(' ');
          line += `\n┣ Vehicle: ${vehStr}${veh.licensePlate ? ` (${veh.licensePlate})` : ''}`;
        }
        line += `\n┗ Issued by: ${b.issuedBy}`;
        return line;
      });

      if (boloCount > 8) boloRows.push(`*...and ${boloCount - 8} more*`);
      boloEmbed.setDescription(boloRows.join('\n\n').slice(0, 4096));
      embeds.push(boloEmbed);
    }
  }

  // ── Action buttons ────────────────────────────────────────────────────────
  const components = [];

  // Quick-status row (always shown)
  const quickRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dispatch_quick_10_8')
      .setLabel('10-8 — Available')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('dispatch_quick_10_6')
      .setLabel('10-6 — Busy')
      .setStyle(ButtonStyle.Secondary),
  );
  components.push(quickRow);

  // Clear-status buttons for each on-duty officer (up to 4 per row, max 3 rows = 12 officers)
  const clearButtons = officers.slice(0, 12).map((o) =>
    new ButtonBuilder()
      .setCustomId(`dispatch_clear_status_${o.userId}`)
      .setLabel(`✕ ${o.username.slice(0, 18)}`)
      .setStyle(ButtonStyle.Danger)
  );
  for (let i = 0; i < clearButtons.length; i += 4) {
    components.push(new ActionRowBuilder().addComponents(clearButtons.slice(i, i + 4)));
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
      .setTitle('10-99 — OFFICER NEEDS ASSISTANCE')
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

    // ── Auto-activate priority board ──────────────────────────────────────
    try {
      const priority = await Priority.findOne({ guildId: guild.id });
      if (priority?.channelId) {
        const wasAlreadyActive = priority.priorityActive;
        priority.priorityActive = true;
        priority.priorityIssuedBy = `${officerName} (Auto — 10-99)`;
        priority.activatedAt = new Date();
        await priority.save();

        const { buildPriorityEmbed } = await import('./priorityTrackerHandler.js');
        const prEmbed = await buildPriorityEmbed(priority);
        const prCh = guild.channels.cache.get(priority.channelId) ||
          await guild.channels.fetch(priority.channelId).catch(() => null);
        if (prCh?.isTextBased() && priority.messageId) {
          const prMsg = await prCh.messages.fetch(priority.messageId).catch(() => null);
          if (prMsg) await prMsg.edit({ embeds: [prEmbed] }).catch(() => {});
        }

        console.log(`[Dispatch] Priority board activated for 10-99 in ${guild.name} (was already active: ${wasAlreadyActive})`);

        // Auto-reset after 5 minutes
        setTimeout(async () => {
          try {
            const pr = await Priority.findOne({ guildId: guild.id });
            if (pr && pr.priorityIssuedBy?.includes('Auto — 10-99')) {
              pr.priorityActive = false;
              pr.priorityIssuedBy = null;
              pr.activatedAt = null;
              await pr.save();

              const { buildPriorityEmbed: buildEmbed } = await import('./priorityTrackerHandler.js');
              const resetEmbed = await buildEmbed(pr);
              const ch = guild.channels.cache.get(pr.channelId) ||
                await guild.channels.fetch(pr.channelId).catch(() => null);
              if (ch?.isTextBased() && pr.messageId) {
                const msg = await ch.messages.fetch(pr.messageId).catch(() => null);
                if (msg) await msg.edit({ embeds: [resetEmbed] }).catch(() => {});
              }

              // Rebuild status board to reflect priority cleared
              const cfg = await DispatchConfig.findOne({ guildId: guild.id });
              await rebuildStatusBoard(guild, cfg);

              console.log(`[Dispatch] Priority board auto-reset after 10-99 in ${guild.name}`);

              // Announce via TTS that priority is cleared
              if (cfg?.aiEnabled && hasAIKey()) {
                try {
                  const { playDispatchVoice } = await import('../utils/voiceListener.js');
                  const ttsBuf = await generateDispatchTTS(`Attention all units, the ten ninety nine alert has been standing down. Priority is now deactivated. All units please update your status.`);
                  playDispatchVoice(guild.id, ttsBuf);
                } catch {}
              }
            }
          } catch (e) {
            console.error('[Dispatch] 10-99 priority auto-reset error:', e.message);
          }
        }, 5 * 60 * 1000);
      }
    } catch (e) {
      console.error('[Dispatch] 10-99 priority board update error:', e.message);
    }

    // Rebuild status board now (will show red + priority active)
    await rebuildStatusBoard(guild, config);
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
      .setTitle('10-99 — OFFICER NEEDS ASSISTANCE')
      .setDescription(
        (interaction.message.embeds[0]?.description || '') +
        `\n\n**<@${interaction.user.id}> (${responderName}) is en route.**`
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
// 10-80 PURSUIT BROADCAST
// ────────────────────────────────────────────────────────────────────────────
// Map<guildId, { officerId, officerName, pursuitChannelId, patrolChannelId, timestamp }>
const activePursuitAlerts = new Map();

async function triggerPursuitBroadcast(guild, config, officerId, officerName, pursuitChannelId) {
  try {
    const patrolChannelId = config.patrolChannelIds?.[0];

    activePursuitAlerts.set(guild.id, {
      officerId,
      officerName,
      pursuitChannelId,
      patrolChannelId,
      timestamp: Date.now(),
    });

    // ── Return bot to patrol channel so backup officers can be heard ──────
    if (patrolChannelId) {
      const { getDispatchState, moveToChannel } = await import('../utils/voiceListener.js');
      const state = getDispatchState(guild.id);
      if (state) {
        // Remove pursuit channel from temp patrol set if it was added
        state.patrolChannelIds.delete(pursuitChannelId);
      }
      const patrolCh = guild.channels.cache.get(patrolChannelId) ||
        await guild.channels.fetch(patrolChannelId).catch(() => null);
      if (patrolCh) {
        await moveToChannel(patrolCh).catch(() => {});
      }
    }

    // ── Broadcast via TTS in patrol channel ──────────────────────────────
    if (config.aiEnabled && hasAIKey()) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');
        const ttsText = `Attention all units, Officer ${officerName} is in an active ten eighty pursuit. All available units, will anyone respond to back up ${officerName}? Say ten four to respond or press the respond button in dispatch.`;
        const ttsBuffer = await generateDispatchTTS(ttsText);
        playDispatchVoice(guild.id, ttsBuffer);
      } catch (err) {
        console.error('[Dispatch TTS] Pursuit broadcast TTS error:', err.message);
      }
    }

    // ── Post embed in dispatch channel with Respond button ───────────────
    if (config.dispatchChannelId) {
      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
      if (dispatchCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('10-80 — Active Pursuit')
          .setDescription(
            `**Officer:** <@${officerId}> (${officerName})\n` +
            `**Status:** Active pursuit in progress\n` +
            `**Pursuit Channel:** <#${pursuitChannelId}>\n\n` +
            `Officer ${officerName} has initiated a **10-80 pursuit**. Any available unit, please respond.\n` +
            `Pressing **"Respond to Pursuit"** will move you to the pursuit channel.`
          )
          .setFooter({ text: 'RPM • Dispatch' })
          .setTimestamp();

        const respondBtn = new ButtonBuilder()
          .setCustomId(`dispatch_pursuit_respond_${guild.id}`)
          .setLabel('Respond to Pursuit')
          .setStyle(ButtonStyle.Danger);

        await dispatchCh.send({
          content: '@here',
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(respondBtn)],
        }).catch(() => {});
      }
    }

    console.log(`[Dispatch] 10-80 pursuit broadcast triggered for ${officerName} in ${guild.name}, pursuit channel: ${pursuitChannelId}`);

    // Auto-clear the pursuit alert after 10 minutes
    setTimeout(() => {
      const current = activePursuitAlerts.get(guild.id);
      if (current?.officerId === officerId) activePursuitAlerts.delete(guild.id);
    }, 10 * 60 * 1000);
  } catch (err) {
    console.error('[Dispatch] triggerPursuitBroadcast error:', err.message);
  }
}

export async function handlePursuitRespondButton(interaction) {
  try {
    const guildId = interaction.customId.replace('dispatch_pursuit_respond_', '');
    const pursuit = activePursuitAlerts.get(guildId);

    if (!pursuit) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#2d2d2d').setDescription('This pursuit alert is no longer active.').setFooter({ text: 'RPM' })],
        flags: 64,
      });
    }

    const responderName = interaction.member.displayName || interaction.user.username;

    // Move the responding officer to the pursuit channel
    const pursuitChannel = interaction.guild.channels.cache.get(pursuit.pursuitChannelId) ||
      await interaction.guild.channels.fetch(pursuit.pursuitChannelId).catch(() => null);

    if (pursuitChannel && interaction.member.voice?.channelId) {
      await interaction.member.voice.setChannel(pursuitChannel).catch(() => {});
    }

    // Update the embed to show who responded
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
      .setDescription(
        (interaction.message.embeds[0]?.description || '') +
        `\n\n**<@${interaction.user.id}> (${responderName}) is responding — moved to pursuit channel.**`
      );

    const disabledBtn = new ButtonBuilder()
      .setCustomId(`dispatch_pursuit_respond_${guildId}`)
      .setLabel(`${responderName} — Responding`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    await interaction.update({ embeds: [updatedEmbed], components: [new ActionRowBuilder().addComponents(disabledBtn)] });

    // TTS acknowledgment in patrol
    const config = await DispatchConfig.findOne({ guildId });
    if (config?.aiEnabled && hasAIKey()) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');
        const ttsText = `Copy ${responderName}, moving you to the pursuit channel to back up ${pursuit.officerName}. Ten four.`;
        const ttsBuffer = await generateDispatchTTS(ttsText);
        playDispatchVoice(guildId, ttsBuffer);
      } catch {}
    }
  } catch (err) {
    console.error('[Dispatch] Pursuit respond button error:', err.message);
    interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
  }
}

// Detects if an officer in patrol is responding verbally to an active pursuit
function detectPursuitResponse(text) {
  return /\b(?:yes|ten[\s-]?four|copy|responding|i'?ll?\s+respond|i'?m\s+(?:responding|en\s*route)|on\s+my\s+way|rolling|ten[\s-]?76)\b/i.test(text);
}

// ────────────────────────────────────────────────────────────────────────────
// TRAFFIC STOP CHECK-IN TIMER (every 1 minute)
// ────────────────────────────────────────────────────────────────────────────
const trafficStopCheckIntervals = new Map();
const trafficStopCheckinSent = new Map(); // key: guildId:userId — tracks last checkin msg time

async function checkTrafficStops(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled) return;

    const onStopOfficers = await OfficerStatus.find({ guildId: guild.id, tenCode: '10-11' });
    if (onStopOfficers.length === 0) return;

    for (const officer of onStopOfficers) {
      const key = `${guild.id}:${officer.userId}`;
      const lastCheck = trafficStopCheckinSent.get(key) || 0;

      // Only check in once per minute
      if (Date.now() - lastCheck < 58 * 1000) continue;

      // Skip check-in if dispatch has an active extended stay for this guild
      const { getExtendedStay } = await import('../utils/voiceListener.js');
      const stay = getExtendedStay(guild.id);
      if (stay) {
        console.log(`[Dispatch] Skipping traffic stop check-in for ${officer.username} — extended stay active`);
        continue;
      }

      // Find the officer's current voice channel
      const member = await guild.members.fetch(officer.userId).catch(() => null);
      const voiceChannelId = member?.voice?.channelId || officer.trafficStopChannelId;
      if (!voiceChannelId) continue;

      const targetChannel = guild.channels.cache.get(voiceChannelId) ||
        await guild.channels.fetch(voiceChannelId).catch(() => null);
      if (!targetChannel) continue;

      trafficStopCheckinSent.set(key, Date.now());

      const minutesIn = officer.trafficStopStartAt
        ? Math.floor((Date.now() - new Date(officer.trafficStopStartAt).getTime()) / 60000)
        : null;

      console.log(`[Dispatch] Delivering traffic stop check-in TTS for ${officer.username} in channel "${targetChannel.name}"`);

      // Speak the check-in into the traffic stop voice channel, then return to patrol
      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playTTSInChannelAndReturn } = await import('../utils/voiceListener.js');
          const subjectPart = officer.subject ? ` with ${officer.subject}` : '';
          const minutesPart = minutesIn !== null ? ` You have been on scene for ${minutesIn} minute${minutesIn !== 1 ? 's' : ''}.` : '';
          const ttsText = `${officer.username}, are you still on scene${subjectPart}?${minutesPart} Please confirm your status or say ten eight when clear.`;
          const ttsBuffer = await generateDispatchTTS(ttsText);
          await playTTSInChannelAndReturn(targetChannel, ttsBuffer);
        } catch (err) {
          console.error('[Dispatch TTS] Traffic stop check-in TTS error:', err.message);
        }
      }

      // Also post a small text prompt with buttons in the dispatch channel so officers can respond
      if (config.dispatchChannelId) {
        const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
        if (dispatchCh?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#FF8C00')
            .setTitle('Traffic Stop Check-In')
            .setDescription(
              `<@${officer.userId}> — are you still on scene${officer.subject ? ` with **${officer.subject}**` : ''}?` +
              (minutesIn !== null ? `\n-# ${minutesIn} minute${minutesIn !== 1 ? 's' : ''} on scene` : '')
            )
            .setFooter({ text: 'RPM • Dispatch' })
            .setTimestamp();

          const stillOnBtn = new ButtonBuilder()
            .setCustomId(`dispatch_stop_still_${officer.userId}`)
            .setLabel('Still on Stop')
            .setStyle(ButtonStyle.Primary);

          const clearBtn = new ButtonBuilder()
            .setCustomId(`dispatch_stop_clear_${officer.userId}`)
            .setLabel('10-8 — Stop Clear')
            .setStyle(ButtonStyle.Success);

          await dispatchCh.send({
            content: `<@${officer.userId}>`,
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(stillOnBtn, clearBtn)],
          }).catch(() => {});
        }
      }
    }

    // Clean up stale keys
    for (const [key] of trafficStopCheckinSent) {
      const [gId, uId] = key.split(':');
      if (gId !== guild.id) continue;
      if (!onStopOfficers.some(o => o.userId === uId)) trafficStopCheckinSent.delete(key);
    }
  } catch (err) {
    console.error('[Dispatch] checkTrafficStops error:', err.message);
  }
}

export function startTrafficStopCheckTimer(_guild) {
  // Traffic stop check-in messages disabled
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

const ON_SCENE_CODES = new Set(['10-11', '10-97', '10-80', '10-78']);

async function checkStatusReminders(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled || !config.patrolChannelIds?.length) return;

    // Only check the single patrol voice channel (first one configured)
    const patrolChannelId = config.patrolChannelIds[0];
    const patrolChannel = guild.channels.cache.get(patrolChannelId) ||
      await guild.channels.fetch(patrolChannelId).catch(() => null);
    if (!patrolChannel) return;

    const needsReminder = [];   // officers with no status
    const stillOnScene = [];    // officers whose status is still an on-scene code

    for (const [, voiceMember] of patrolChannel.members) {
      if (voiceMember.user.bot) continue;
      const name = voiceMember.displayName || voiceMember.user.username;
      const status = await OfficerStatus.findOne({ guildId: guild.id, userId: voiceMember.id });
      if (!status || !status.tenCode) {
        needsReminder.push(name);
      } else if (ON_SCENE_CODES.has(status.tenCode)) {
        stillOnScene.push({ name, code: status.tenCode, subject: status.subject || null });
      }
    }

    if (needsReminder.length === 0 && stillOnScene.length === 0) return;

    console.log(`[Dispatch] Status reminder — no status: ${needsReminder.length}, still on scene: ${stillOnScene.length} in ${guild.name}`);

    if (config.aiEnabled && hasAIKey()) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');

        const parts = [];

        if (needsReminder.length > 0) {
          const nameList = needsReminder.length === 1
            ? needsReminder[0]
            : needsReminder.slice(0, -1).join(', ') + ' and ' + needsReminder.at(-1);
          parts.push(`Attention all units, ${nameList}, please remember to update your current status on the radio. If you are available, say ten eight. If you are busy, say ten six.`);
        }

        if (stillOnScene.length > 0) {
          for (const officer of stillOnScene) {
            const subjectPart = officer.subject ? ` with ${officer.subject}` : '';
            parts.push(`${officer.name}, dispatch showing you still on scene${subjectPart}. Are you still on scene? Please confirm or say ten eight if you are clear.`);
          }
        }

        const ttsText = parts.join(' ');
        const ttsBuffer = await generateDispatchTTS(ttsText);
        playDispatchVoice(guild.id, ttsBuffer);
      } catch (err) {
        console.error('[Dispatch TTS] Status reminder TTS error:', err.message);
      }
    }
  } catch (err) {
    console.error('[Dispatch] checkStatusReminders error:', err.message);
  }
}

export function startStatusReminderTimer(_guild) {
  // Status reminders disabled — no periodic announcements
}

// ────────────────────────────────────────────────────────────────────────────
// HOURLY STATUS RESET (every 60 minutes)
// ────────────────────────────────────────────────────────────────────────────
const hourlyResetIntervals = new Map();
const HOURLY_RESET_MS = 60 * 60 * 1000;

async function runHourlyStatusReset(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled) return;

    console.log(`[Dispatch] Running hourly status reset for ${guild.name}`);

    // Clear all officer statuses for this guild
    await OfficerStatus.deleteMany({ guildId: guild.id });

    // Rebuild the now-empty board
    await rebuildStatusBoard(guild, config);

    // Broadcast TTS in patrol voice channel
    const patrolChannelId = config.patrolChannelIds?.[0];
    if (patrolChannelId && config.aiEnabled && hasAIKey()) {
      // Only broadcast if there are officers in the patrol channel
      const patrolCh = guild.channels.cache.get(patrolChannelId) ||
        await guild.channels.fetch(patrolChannelId).catch(() => null);
      const hasOfficers = patrolCh?.members?.some(m => !m.user.bot);
      if (hasOfficers) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsText = 'Attention all units, dispatch is performing an hourly status reset. All officer statuses have been cleared. All units please update your current status on the radio. Say ten eight if available, ten six if busy, or your current code if you are on scene.';
          const ttsBuffer = await generateDispatchTTS(ttsText);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) {
          console.error('[Dispatch TTS] Hourly reset TTS error:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Dispatch] Hourly status reset error:', err.message);
  }
}

export function startHourlyStatusReset(guild) {
  if (hourlyResetIntervals.has(guild.id)) return;
  const interval = setInterval(() => runHourlyStatusReset(guild), HOURLY_RESET_MS);
  hourlyResetIntervals.set(guild.id, interval);
  console.log(`[Dispatch] Hourly status reset timer started for ${guild.name}`);
}

export function stopHourlyStatusReset(guildId) {
  const interval = hourlyResetIntervals.get(guildId);
  if (interval) {
    clearInterval(interval);
    hourlyResetIntervals.delete(guildId);
  }
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
      userFilter: async () => true,
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
    startHourlyStatusReset(guild);
  } catch (err) {
    console.error(`[Dispatch] initDispatchForGuild error for ${guild.name}:`, err.message);
  }
}
