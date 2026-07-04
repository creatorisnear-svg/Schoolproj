import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { writeFileSync, unlinkSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
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
import { addToRadioLog, getRadioLog } from '../utils/radioSession.js';
import statusEvents from '../utils/statusEvents.js';

// Pre-load panic alert sound (MP3 played urgently over voice on 10-99)
const _panicSoundPath = join(dirname(fileURLToPath(import.meta.url)), '../assets/panic_alert.mp3');
export const PANIC_SOUND_BUFFER = existsSync(_panicSoundPath) ? readFileSync(_panicSoundPath) : null;
if (PANIC_SOUND_BUFFER) {
  console.log(`[Dispatch] Panic alert sound loaded (${PANIC_SOUND_BUFFER.length} bytes)`);
} else {
  console.warn('[Dispatch] Panic alert sound not found - audio alert disabled');
}

const TEN_CODES = {
  '10-4':  { label: '10-4 Acknowledged', action: null },
  '10-6':  { label: '10-6 Busy', action: null },
  '10-7':  { label: '10-7 Out of Service', action: 'out_of_service' },
  '10-8':  { label: '10-8 Available', action: 'available' },
  '10-11': { label: '10-11 Traffic Stop', action: 'traffic_stop' },
  '10-15': { label: '10-15 Prisoner in Custody', action: null },
  '10-17': { label: '10-17 Transporting to Station', action: null },
  '10-20': { label: '10-20 Location', action: null },
  '10-23': { label: '10-23 Arrived at Scene', action: null },
  '10-76': { label: '10-76 En Route', action: null },
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

// Per-guild active call broadcasts waiting for officer voice responses
// Map<guildId, { callId, callNum, issue, location, timestamp }>
const activeBroadcastCalls = new Map();
// Per-guild panic cooldown: prevents duplicate 10-99 alerts within 90 seconds
const _panicCooldowns = new Map();

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
 * Strips PSRP tags from a display name for clean TTS pronunciation.
 * [LSPD] John Smith → John Smith
 * Civ | Jane Doe   → Jane Doe
 * John_Smith        → John Smith
 * SGT. John Smith   → John Smith
 */
function cleanNameForTTS(name) {
  if (!name) return 'officer';
  let n = name;
  // Strip leading [BRACKET] tags: [LSPD], [SASP], [DOC], etc.
  n = n.replace(/^\s*(?:\[[^\]]+\]\s*)+/, '');
  // Strip pipe-delimited sections - keep the longest segment (usually the real name)
  if (n.includes('|')) {
    const parts = n.split('|').map(p => p.trim()).filter(Boolean);
    n = parts.reduce((a, b) => (b.length > a.length ? b : a), parts[0]);
  }
  // Strip common rank/role abbreviations at the start
  n = n.replace(/^(?:sgt|cpl|pvt|pfc|civ|ofc|dep|lt|cpt|cmdr|det|lcpl|ssgt|msgt|spec|ens|chief|corp)\.?\s+/i, '');
  // Replace underscores and dots with spaces (common Discord name separators)
  n = n.replace(/[_\.]+/g, ' ');
  // Strip digits - real names never contain numbers (e.g. "James12" → "James")
  n = n.replace(/\d+/g, ' ');
  // Strip anything that isn't a letter, space, hyphen, or apostrophe
  n = n.replace(/[^a-zA-Z '\-]/g, ' ');
  // Collapse multiple spaces, trim, keep first 2 words (first + last name only)
  n = n.replace(/\s+/g, ' ').trim();
  const words = n.split(' ').filter(Boolean).slice(0, 2);
  return words.join(' ') || 'officer';
}

/**
 * Detects when an officer is releasing/clearing a traffic stop.
 */
function detectReleaseStop(text) {
  return /\b(?:releasing\s+(?:the\s+)?(?:stop|vehicle|car|suspect|driver|them|him|her)|letting\s+(?:them|him|her)\s+go|vehicle\s+(?:is\s+)?(?:released|clear)|stop\s+is\s+(?:clear|done|over|complete|finished)|clearing\s+(?:the\s+)?(?:traffic\s+)?stop|traffic\s+stop\s+(?:is\s+)?(?:clear|done|over|complete)|releasing\s+from\s+(?:my\s+)?stop|releasing\s+my\s+stop|clear\s+from\s+(?:the\s+)?stop|done\s+with\s+(?:the\s+)?stop)\b/i.test(text);
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

export function hasAIKey() {
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
    /run\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?(?:license\s+)?(?:tag\s+)?plates?\s+(?:on\s+)?(?:number\s+)?([a-z0-9][a-z0-9\s-]*)/i,
    /(?:can\s+you\s+)?run\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?plates?\s+(?:for\s+(?:me\s+)?)?([a-z0-9][a-z0-9\s-]*)/i,
    /plates?\s+(?:number\s+)?(?:is\s+)?([a-z0-9][a-z0-9\s-]{1,})\s*(?:run|check|look)/i,
    /(?:check|look\s*up)\s+(?:this\s+)?(?:a\s+)?(?:the\s+)?plates?\s+(?:on\s+)?(?:number\s+)?([a-z0-9][a-z0-9\s-]*)/i,
  ];

  for (const pattern of platePatterns) {
    const match = lower.match(pattern);
    if (match) {
      const raw = match[1].trim().replace(/[\s-]+/g, '').toUpperCase();
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

function detectClearPanic(text) {
  return /\b(?:clear\s+(?:the\s+)?10[-\s]?99|cancel\s+(?:the\s+)?10[-\s]?99|stand\s+down\s+(?:the\s+)?(?:10[-\s]?99|panic|emergency)|10[-\s]?99\s+(?:is\s+)?(?:clear|cleared|cancelled|all\s+clear|stand\s+down)|officer\s+is\s+(?:okay|ok|safe|secure)|i(?:'m|m)\s+(?:okay|ok|safe|secure|good)|false\s+alarm|all\s+(?:good|clear),?\s+(?:stand\s+down|cancel)|deactivate\s+(?:the\s+)?(?:10[-\s]?99|panic))\b/i.test(text);
}

// Returns true only when the text contains vocabulary that belongs in a police dispatch context.
// Used to drop off-topic chatter that happens to say "dispatch" (e.g. "dispatch, can you help me?").
function isDispatchRelevant(text) {
  const DISPATCH_RE = /\b(?:10[-\s]?\d+|code\s*\d|show(?:ing)?(?:\s+me)?|patrol|unit|officer|en\s*route|on\s*scene|on\s*stop|traffic\s*stop|pursuit|robbery|shooting|shots?\s+fired|fire(?:arm)?|suspect|vehicle|plate|tag|registration|backup|assist|ems|ambulance|medic|respond(?:ing)?|available|unavailable|signal|copy|roger|clear(?:ing)?|stand\s*by|status|location|heading|north|south|east|west|street|ave(?:nue)?|blvd|highway|hwy|road|drive|lane|run\s+(?:a\s+)?(?:plate|name|check)|look(?:ing)?\s+up|bolo|warrant|stolen|wanted|armed|weapon|knife|gun|disturbance|domestic|noise|call|incident|scene|crash|accident|medical|overdose|trespass|burglary|assault|fight|drunk|disorderly)\b/gi;
  const matches = (text.match(DISPATCH_RE) || []).length;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  // Tiered threshold: short transmissions (≤6 words) need 1 match;
  // medium (7-12 words) need 2; longer transmissions need 3 distinct matches
  // to prevent casual speech that happens to contain a police-adjacent word.
  if (wordCount <= 6) return matches >= 1;
  if (wordCount <= 12) return matches >= 2;
  return matches >= 3;
}

function detectUnitsCheck(text) {
  return /\b(?:how\s+many\s+(?:units?|officers?)|(?:who(?:'s|\s+is)\s+)?(?:units?\s+)?available\??|what\s+units?\s+(?:are\s+)?(?:available|on\s+duty)|(?:list|show\s+me)\s+(?:available\s+)?(?:units?|officers?)|units?\s+on\s+duty|who(?:'s|\s+is)\s+on\s+duty|how\s+many\s+(?:cops?|units?)\s+(?:are\s+)?(?:out|on\s+duty))\b/i.test(text);
}

function detectEMSRequest(text) {
  const lower = text.toLowerCase().trim();

  // Must start with an explicit "dispatch" address to avoid false positives
  // e.g. "dispatch, I need EMS at Pillbox" or "dispatch send fire department to..."
  const withLoc = lower.match(
    /\bdispatch[,.]?\s+(?:i\s+)?(?:need|send|request)\s+(?:an?\s+)?(?:(ems|ambulance|medic(?:al)?(?:\s+unit)?|fire(?:\s*(?:department|dept|units?|truck|station|fighters?))?))\s+(?:to|at)\s+(.{2,40}?)(?:\s*$)/i
  );
  if (withLoc) {
    const type = /fire/i.test(withLoc[1]) ? 'fire' : 'ems';
    return { type, location: withLoc[2].trim() };
  }

  // Without location - still requires "dispatch" prefix
  // "fire" alone NOT accepted to avoid "taking fire" / "need fire support" false positives
  const withoutLoc = lower.match(
    /\bdispatch[,.]?\s+(?:i\s+)?(?:need|send|request)\s+(?:an?\s+)?(?:(ems|ambulance|medic(?:al)?(?:\s+unit)?|fire\s*(?:department|dept|units?|truck|station|fighters?)))\b/i
  );
  if (withoutLoc) {
    const type = /fire/i.test(withoutLoc[1]) ? 'fire' : 'ems';
    return { type, location: null };
  }
  return null;
}

// ── Call sign & Voice-911 helpers ────────────────────────────────────────────

const CALL_SIGN_PHONETICS = new Set([
  'adam','boy','baker','charlie','charles','david','dog','edward',
  'frank','george','henry','ida','john','king','lincoln',
  'mary','nora','ned','ocean','paul','queen','robert','roger','sam',
  'tom','union','victor','william','xray','young','zebra',
]);

// Spoken number words → digit strings (for call signs like "One Adam 84")
const SPOKEN_NUM_TO_DIGIT = {
  zero:'0', one:'1', two:'2', three:'3', four:'4',
  five:'5', six:'6', seven:'7', eight:'8', nine:'9', ten:'10',
};

// Emergency phrases that always bypass the trigger requirement
// NOTE: "officer needs backup" is intentionally excluded here - backup = 10-78, NOT 10-99 panic
const EMERGENCY_BYPASS_RE = /\b(?:shots?\s+fired|officer\s+down|mayday|officer\s+needs?\s+(?:immediate\s+)?(?:help|assistance)|10[-\s]?99|we\s+have\s+shots|man\s+down|officer\s+needs\s+help)\b/i;

/**
 * Detects a police call sign at the start of a transmission.
 * Returns { callSign, remainder } or null.
 * Handles: "1 Adam 22 ...", "One Adam 84 ...", "Adam 22 ...", "2 Lincoln 40 ...", "Marshal Command ..."
 */
function detectCallSign(text) {
  const lower = text.trim().toLowerCase();
  const words = lower.split(/\s+/);

  // Normalise first word from spoken number to digit (e.g. "one" → "1")
  const normFirst = SPOKEN_NUM_TO_DIGIT[words[0]] ?? words[0];
  // Normalise third word similarly
  const normThird = words[2] ? (SPOKEN_NUM_TO_DIGIT[words[2]] ?? words[2]) : null;

  // Special command call signs: "Marshal Command", "County Command", "Central Dispatch"
  if (/^(?:marshal|county|central|command)\s*(?:command|dispatch|base|control)?/i.test(lower)) {
    const remainder = words.slice(2).join(' ').trim();
    if (remainder.length > 2) return { callSign: words.slice(0, 2).join(' '), remainder };
  }

  // Pattern: [number|word-number] [phonetic] [number|word-number] - e.g. "1 Adam 22", "One Adam 84"
  if (
    words.length >= 3 &&
    /^\d+$/.test(normFirst) &&
    CALL_SIGN_PHONETICS.has(words[1]) &&
    normThird && /^\d+$/.test(normThird)
  ) {
    const remainder = words.slice(3).join(' ').trim();
    if (remainder.length > 1) return { callSign: `${normFirst}-${words[1]}-${normThird}`, remainder };
  }

  // Pattern: [phonetic] [number] - e.g. "Adam 22" or "Lincoln 4"
  if (words.length >= 2 && CALL_SIGN_PHONETICS.has(words[0]) && /^\d+$/.test(normThird ?? words[1])) {
    const numPart = SPOKEN_NUM_TO_DIGIT[words[1]] ?? words[1];
    if (/^\d+$/.test(numPart)) {
      const remainder = words.slice(2).join(' ').trim();
      if (remainder.length > 1) return { callSign: `${words[0]}-${numPart}`, remainder };
    }
  }

  return null;
}

// Map spoken code numbers / slang to incident type labels for voice call creation
const VOICE_CALL_CODE_MAP = {
  '10': 'Suspicious Activity', '11': 'Animal Complaint', '30': 'Robbery',
  '31': 'Crime in Progress', '32': 'Robbery in Progress', '33': 'Emergency',
  '50': 'Vehicle Accident', '52': 'EMS Requested', '59': 'Stolen Vehicle',
  '62': 'Grand Theft Auto', '80': 'Vehicle Pursuit', '87': 'Homicide',
  '99': 'Officer Needs Assistance', '211': 'Robbery', '245': 'Assault',
  '415': 'Disturbance', '459': 'Burglary', '487': 'Grand Theft',
  '502': 'DUI', '503': 'Stolen Vehicle',
};

/**
 * Detects a voice 911 call creation request.
 * Returns { incident, location, count } or null.
 * Handles: "roll me a 32 at Mirror Park", "roll multiple 32s", "I've got a robbery at [loc]"
 */
function detectVoiceCallCreation(text) {
  const lower = text.toLowerCase().trim();

  // "roll [me] [a|an|multiple|N] [code|incident] [at location]"
  const rollMatch = lower.match(
    /\broll(?:\s+(?:me|us))?\s+(?:a\s+|an\s+|multiple\s+|(?:(\d+)\s+))?(\d{2,3}|robbery|shooting|fight|assault|pursuit|burglary|domestic|fire|accident|disturbance|suspicious|welfare|overdose|gta|theft|homicide)(?:\s+(?:at|on|near|by|in)\s+(.{3,60}?))?(?:\s*$|\s+(?:please|now|asap))/i
  );
  if (rollMatch) {
    const countStr = rollMatch[1];
    const codeOrType = rollMatch[2];
    const location = rollMatch[3]?.trim() || null;
    const incident = VOICE_CALL_CODE_MAP[codeOrType] || (codeOrType.charAt(0).toUpperCase() + codeOrType.slice(1) + ' call');
    const count = countStr ? Math.min(parseInt(countStr), 5) : (lower.includes('multiple') ? 3 : 1);
    return { incident, location, count };
  }

  // "I've got / we have / there's a [incident] at [location]" - officer reporting for dispatch to roll
  const gotMatch = lower.match(
    /\b(?:i(?:'ve|ve|'m|m)\s+(?:got|have|spotted|got\s+a)|we\s+have|there(?:'s|\s+is)|we\s+got)\s+(?:a\s+|an\s+)?(robbery|shooting|fight|assault|domestic|fire|accident|disturbance|suspicious\s+person|suspicious\s+vehicle|welfare\s+check|overdose|homicide|burglary|theft|crash)\b(?:\s+(?:at|on|near|by|in)\s+(.{3,60}?))?(?:\s*$)/i
  );
  if (gotMatch) {
    const incident = gotMatch[1].charAt(0).toUpperCase() + gotMatch[1].slice(1);
    const location = gotMatch[2]?.trim() || null;
    return { incident, location, count: 1 };
  }

  // "create a call for [incident]"
  const createMatch = lower.match(
    /\bcreate\s+(?:a\s+)?(?:call|911\s+call|report)\s+(?:for\s+)?(.{3,40?})(?:\s+at\s+(.{3,60?}))?(?:\s*$)/i
  );
  if (createMatch) {
    return { incident: createMatch[1].trim(), location: createMatch[2]?.trim() || null, count: 1 };
  }

  return null;
}

/**
 * Detects if an officer is responding to an active broadcast call.
 */
function detectRespondToBroadcast(text) {
  // Only match explicit "I am responding to this call" language.
  // Generic acknowledgments ("copy that", "10-4", "en route") are common radio chatter
  // and must NOT be treated as responding to a broadcast call - they cause false positives.
  return /\b(?:i(?:'ll|ll)\s+(?:respond|take\s+(?:it|that|the\s+call))|show\s+me\s+responding|i(?:'m|m)\s+responding\s+(?:to\s+(?:that|this|the)\s+call)?|responding\s+to\s+(?:that|this|the)\s+call|i(?:'ll|ll)\s+respond\s+to\s+(?:that|this|the))\b/i.test(text);
}

// ────────────────────────────────────────────────────────────────────────────

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
  // 10-4 - Copy / Acknowledged
  [/\b(?:copy\s+that|copy|roger\s+that|roger|acknowledged|affirmative)\b/i, '10-4'],
  // 10-6 - Busy
  [/\b(?:i(?:'m|m)\s+)?busy\b/i, '10-6'],
  // 10-7 - Out of Service
  [/\b(?:going\s+)?(?:out\s+of\s+service|logging\s+off|signing\s+off|going\s+off(?:\s+duty)?)\b/i, '10-7'],
  // 10-8 - Available / In Service
  [/\b(?:i(?:'m|m)\s+)?(?:back\s+(?:in\s+service|available|on\s+patrol)|going\s+available|available|back\s+in\s+service|in\s+service|back\s+on\s+patrol)\b/i, '10-8'],
  [/\bi(?:'m|m)\s+back\b/i, '10-8'],
  // 10-11 - Traffic Stop (no name, just announcing a stop)
  [/\b(?:out\s+with\s+a\s+(?:vehicle|car|truck)|traffic\s+stop|got\s+a\s+stop|making\s+a\s+stop|initiating\s+a\s+stop)\b/i, '10-11'],
  // 10-12 - Stand By
  [/\b(?:stand\s+by|standby)\b/i, '10-12'],
  // 10-17 - En Route / Meet
  [/\b(?:en\s+route\s+to|heading\s+to|on\s+my\s+way\s+to|rolling\s+to)\b/i, '10-17'],
  // 10-20 - Location
  [/\b(?:my\s+location\s+is|i(?:'m|m)\s+(?:at|on|near)|current\s+location)\b/i, '10-20'],
  // 10-76 - En Route (general)
  [/\b(?:en\s+route|on\s+my\s+way|responding)\b/i, '10-76'],
  // 10-80 - Pursuit
  [/\b(?:in\s+pursuit|pursuing|vehicle\s+pursuit|foot\s+pursuit|in\s+a\s+(?:chase|pursuit)|high[\s-]speed\s+chase|chasing)\b/i, '10-80'],
  // 10-23 - Arrived at Scene (en route → arrived, before 10-97 on-scene)
  [/\b(?:just\s+arrived?|arrived?\s+(?:at\s+)?(?:the\s+)?(?:location|address|scene)?|pulling\s+up)\b/i, '10-23'],
  // 10-97 - On Scene / Arrived
  [/\b(?:on\s+scene|i(?:'m|m)\s+(?:on\s+scene|at\s+the\s+scene|on\s+location))\b/i, '10-97'],
  // 10-99 - Officer Down / Emergency (backup = 10-78, NOT 10-99)
  [/\b(?:officer\s+down|shots?\s+fired|officer\s+needs?\s+(?:immediate\s+)?(?:help|assistance)|mayday|emergency)\b/i, '10-99'],
  // 10-19 - Return to Station
  [/\b(?:returning\s+to\s+(?:the\s+)?station|heading\s+back\s+to\s+(?:the\s+)?station|going\s+(?:back\s+to\s+)?(?:the\s+)?station|back\s+to\s+(?:the\s+)?station)\b/i, '10-19'],
  // 10-50 - Accident
  [/\b(?:vehicle\s+accident|traffic\s+accident|crash(?:ed)?|accident\s+(?:at|on|near)|we\s+have\s+an?\s+accident|reporting\s+an?\s+accident)\b/i, '10-50'],
  // 10-52 - EMS Requested (must be explicitly directed at dispatch)
  [/\bdispatch[,.]?\s+(?:i\s+)?(?:need\s+(?:an?\s+)?(?:ambulance|ems|medic(?:al)?)|requesting\s+(?:an?\s+)?(?:ambulance|ems|medics?)|send\s+(?:an?\s+)?(?:ambulance|ems|medics?))\b/i, '10-52'],
  // 10-31 - Crime in Progress
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
  // Emergency/high-priority codes are checked FIRST so they are never shadowed
  // by phrase-alias conversions (e.g. "on scene" → 10-97 must not hide a 10-99).
  const PRIORITY_CODES = ['10-99', '10-80', '10-78'];
  const _checkOrder = [...PRIORITY_CODES, ...Object.keys(TEN_CODES).filter(c => !PRIORITY_CODES.includes(c))];
  for (const code of _checkOrder) {
    // Require an explicit separator (dash or space) so e.g. "1080" never
    // triggers 10-80 - only "10-80" or "10 80" should match.
    const escaped = code.replace('-', '[-\\s]');
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
  'GTA V FiveM police radio. Officers address dispatch by saying "Dispatch" clearly at the start. ' +
  'Example transmissions: "Dispatch, ten eleven at Vinewood." "Dispatch, I am ten eight." "Dispatch, requesting backup at Legion Square." ' +
  'Call signs use LAPD phonetic alphabet: Adam, Baker, Charles, David, Edward, Frank, George, Henry, Ida, John, King, Lincoln, Mary, Nora, Ocean, Paul, Queen, Robert, Sam, Tom, Union, Victor, William, X-ray, Young, Zebra. ' +
  'Example call signs: "1 Adam 22", "2 Lincoln 40", "3 Baker 15", "Adam 22", "Lincoln 4". ' +
  'Also valid: "Dispatch", "Marshal Command", "County Command", "Central Dispatch". ' +
  'Ten codes spoken as words within a sentence, e.g. "Dispatch, Adam 15 going ten eleven at Vinewood" or "Unit 22, showing ten seventy-six". ' +
  'Full ten code list: 10-4 copy, 10-6 busy, 10-7 out of service, 10-8 available, 10-10 off duty, 10-11 traffic stop, ' +
  '10-15 prisoner, 10-19 return to station, 10-20 location, 10-23 on scene, 10-31 disturbance, ' +
  '10-50 accident, 10-52 ambulance, 10-76 en route, 10-78 need backup, 10-80 in pursuit, 10-97 arrived, 10-99 officer down panic. ' +
  'Common phrases: traffic stop, show me in, show me on, show me available, show me out of service, ' +
  'in pursuit, on scene, en route, code four, all clear, requesting backup, units available, ' +
  'run the plate, run the name, check warrants, run a serial, roll a unit, send EMS, send fire, ' +
  'I will respond, copy that, ten four, roger, stand by, be advised, ' +
  'Pillbox Hill, Maze Bank, Legion Square, Rockford Hills, Vinewood, Sandy Shores, Paleto Bay, Mirror Park, Davis, Strawberry, ' +
  'Boulevard, Freeway, Highway, intersection, mile marker, eastbound, westbound, northbound, southbound.';

async function transcribeAudio(wavBuffer) {
  const tempPath = join(tmpdir(), `dispatch_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  writeFileSync(tempPath, wavBuffer);
  try {
    let lastErr;
    const maxTries = Math.max(1, groqKeys.length);
    for (let attempt = 0; attempt < maxTries; attempt++) {
      const { client, provider } = getAIClient();
      const model = provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';
      try {
        const result = await client.audio.transcriptions.create({
          file: createReadStream(tempPath),
          model,
          language: 'en',
          prompt: WHISPER_PROMPT.slice(0, 896),
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

async function handlePendingStopMoveVoiceAnswer(guild, config, member, transcript, ttsName) {
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
      const _reqTtsName = ttsName || cleanNameForTTS(request.officerName);
      const ackText = approve
        ? `Copy ${_reqTtsName}, ten four - moving you now.`
        : `Copy ${_reqTtsName}, ten four - keeping you where you are.`;
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

const TTS_VOICE = 'diana';

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
    const voice = provider === 'groq' ? TTS_VOICE : 'onyx';
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

// ── Parallel TTS helpers ────────────────────────────────────────────────────
// Call startTTS() as soon as you know the text, do other async work, then
// await playTTS() - TTS is already generating in the background.
function startTTS(text, config) {
  if (!config?.aiEnabled || !hasAIKey()) return null;
  return generateDispatchTTS(text).catch(() => null);
}
async function playTTS(ttsPromise, guildId, { urgent = false } = {}) {
  if (!ttsPromise) return;
  try {
    const { playDispatchVoice, playRadioWaveLeadIn } = await import('../utils/voiceListener.js');
    // Kick off the radio wave lead-in immediately - it overlaps with TTS
    // generation (still in flight from startTTS) instead of only starting
    // once the full clip is ready, which used to add its playback time on
    // top of transcription+LLM+TTS latency. Skipped for urgent clips
    // (panic/pursuit), which already play raw without any wave prefix.
    if (!urgent) playRadioWaveLeadIn(guildId);
    const buf = await ttsPromise;
    if (buf) playDispatchVoice(guildId, buf, { urgent, skipRadioWave: true });
  } catch {}
}
// ───────────────────────────────────────────────────────────────────────────

// Radio log helpers are provided by ../utils/radioSession.js (imported above).

const SIMPLE_ACK_CODES = new Set(['10-4', '10-7', '10-6']);


// Fuzzy-match an officer name from the radio log to a status record
function findOfficerByName(searchName, allStatuses) {
  if (!searchName || !allStatuses?.length) return null;
  const search = cleanNameForTTS(searchName).toLowerCase().trim();
  // Exact full-name match
  let match = allStatuses.find(s => cleanNameForTTS(s.username).toLowerCase() === search);
  if (match) return match;
  // First-name match
  match = allStatuses.find(s => {
    const first = cleanNameForTTS(s.username).toLowerCase().split(' ')[0];
    return first === search || search === first;
  });
  if (match) return match;
  // Partial contains
  return allStatuses.find(s => {
    const name = cleanNameForTTS(s.username).toLowerCase();
    const first = name.split(' ')[0];
    return name.includes(search) || search.includes(first);
  }) || null;
}

// Execute actions the AI decided to take (move channels, update statuses, close calls, etc.)
async function executeDispatchActions(actions, guild, config, allStatuses, speakingUserId) {
  if (!actions?.length) return;
  for (const action of actions) {
    try {
      const { name, args } = action;
      console.log(`[Dispatch AI] Action: ${name}`, args);

      if (name === 'move_to_traffic_stop') {
        // Never auto-move - create a pending request so officer is asked first
        const target = findOfficerByName(args.officer_name, allStatuses)
          ?? allStatuses.find(s => s.userId === speakingUserId);
        if (!target) continue;
        const targetMember = await guild.members.fetch(target.userId).catch(() => null);
        if (!targetMember?.voice?.channelId) continue;
        if (!(config.trafficStopChannelIds?.length > 0)) continue;

        // Find best (least populated) stop channel
        let bestId = null, bestCount = Infinity;
        for (const id of (config.trafficStopChannelIds || [])) {
          if (id === targetMember.voice.channelId) continue;
          const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
          if (!ch) continue;
          const count = ch.members.filter(m => !m.user.bot).size;
          if (count < bestCount) { bestCount = count; bestId = id; }
        }
        if (!bestId) continue;

        // Queue a pending move request - officer must confirm verbally ("yes" / "affirmative")
        const moveKey = getPendingStopMoveKey(guild.id, target.userId);
        pendingStopMoveRequests.set(moveKey, {
          officerId: target.userId,
          officerName: target.username,
          channelId: bestId,
          targetId: null,
          targetName: null,
          dispatchChannelId: config.dispatchChannelId || null,
          messageId: null,
          transcript: args.officer_name || '',
          expiresAt: Date.now() + 90_000,
        });
        console.log(`[Dispatch AI] Queued move request for ${target.username} - awaiting voice confirmation`);
      }

      else if (name === 'move_to_patrol') {
        const target = findOfficerByName(args.officer_name, allStatuses)
          ?? allStatuses.find(s => s.userId === speakingUserId);
        if (!target) continue;
        const targetMember = await guild.members.fetch(target.userId).catch(() => null);
        if (!targetMember?.voice?.channelId) continue;
        const patrolChId = config.patrolChannelIds?.[0];
        if (!patrolChId) continue;
        const patrolCh = guild.channels.cache.get(patrolChId)
          || await guild.channels.fetch(patrolChId).catch(() => null);
        if (patrolCh) {
          await targetMember.voice.setChannel(patrolCh).catch(() => {});
          console.log(`[Dispatch AI] Moved ${target.username} to patrol`);
        }
      }

      else if (name === 'update_officer_status') {
        // Always use the actual speaking officer - never guess by name, which causes wrong-person bugs
        const target = allStatuses.find(s => s.userId === speakingUserId)
          ?? findOfficerByName(args.officer_name, allStatuses);
        if (!target) continue;
        // Normalise spoken codes like "10-8", "108", "ten-eight" → "10-8"
        let code = String(args.ten_code || '').trim().toUpperCase()
          .replace(/^TEN[- ]?/i, '10-')
          .replace(/^(\d{2,3})$/, '10-$1');
        if (!code.startsWith('10-')) code = '10-' + code;
        await updateOfficerStatus(guild.id, target.userId, target.username, code,
          { code, codeInfo: TEN_CODES[code], rawText: 'AI dispatch action' }, null, null);
        console.log(`[Dispatch AI] Status updated: ${target.username} → ${code}`);
      }

      else if (name === 'close_call') {
        const num = String(args.call_number || '').trim();
        const call = await EmergencyCall.findOne({
          guildId: guild.id,
          $or: [{ callId: { $regex: num + '$' } }, { callId: num }],
          status: 'active',
        });
        if (call) {
          call.status = 'resolved';
          await call.save();
          console.log(`[Dispatch AI] Closed call #${num}`);
        }
      }

      else if (name === 'send_unit_to_call') {
        const target = findOfficerByName(args.officer_name, allStatuses);
        if (!target) continue;
        const num = String(args.call_number || '').trim();
        const call = await EmergencyCall.findOne({
          guildId: guild.id,
          $or: [{ callId: { $regex: num + '$' } }, { callId: num }],
          status: 'active',
        });
        if (call
          && call.respondingLeoId !== target.userId
          && !call.attachedLeoIds?.includes(target.userId)) {
          call.attachedLeoIds = call.attachedLeoIds || [];
          call.attachedLeoIds.push(target.userId);
          await call.save();
          console.log(`[Dispatch AI] Attached ${target.username} to call #${num}`);
        }
      }

      else if (name === 'add_call_note') {
        const num = String(args.call_number || '').trim();
        const call = await EmergencyCall.findOne({
          guildId: guild.id,
          $or: [{ callId: { $regex: num + '$' } }, { callId: num }],
          status: 'active',
        });
        if (call) {
          const noteType = String(args.note_type || 'notes').trim();
          const note     = String(args.note || '').trim();
          if (noteType === 'suspects' || noteType === 'suspect') {
            call.suspectsDescription = note;
          } else if (noteType === 'location') {
            call.location = note;
          } else if (noteType === 'vehicle') {
            call.suspectsDescription = call.suspectsDescription
              ? `${call.suspectsDescription} | Vehicle: ${note}`
              : `Vehicle: ${note}`;
          } else {
            call.issue = call.issue ? `${call.issue} - ${note}` : note;
          }
          await call.save();
          console.log(`[Dispatch AI] Added ${noteType} note to call #${num}`);
        }
      }

      else if (name === 'flag_officer_needs_backup') {
        const target = findOfficerByName(args.officer_name, allStatuses)
          ?? allStatuses.find(s => s.userId === speakingUserId);
        if (!target) continue;
        await updateOfficerStatus(guild.id, target.userId, target.username, '10-78',
          { code: '10-78', codeInfo: TEN_CODES['10-78'], subject: null, location: null, rawText: 'AI dispatch: backup needed' },
          null, null);
        console.log(`[Dispatch AI] Flagged ${target.username} as 10-78 backup needed`);
      }

      else if (name === 'create_bolo') {
        // Post a BOLO embed to the dispatch channel and attempt DB creation
        const suspectName = String(args.suspect_name || 'Unknown').trim();
        const reason = String(args.reason || '').trim();
        const description = String(args.description || '').trim();
        const lastSeen = String(args.last_seen || '').trim();

        // Build vehicle line if provided
        const vParts = [args.vehicle_color, args.vehicle_make, args.vehicle_model].filter(Boolean);
        const vehicleLine = vParts.length > 0 ? vParts.join(' ') + (args.license_plate ? ` - Plate: ${args.license_plate}` : '') : null;

        // Try to find a matching CAD character for DB linkage
        let boloCharacter = null;
        if (suspectName !== 'Unknown') {
          try {
            boloCharacter = await CADCharacter.findOne({
              guildId: guild.id,
              fullName: { $regex: new RegExp(suspectName.split(/\s+/)[0], 'i') },
            }).lean();
          } catch {}
        }

        // Post BOLO embed to dispatch channel
        if (config.dispatchChannelId) {
          const dispCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
          if (dispCh?.isTextBased()) {
            const boloDesc = [
              `**Suspect:** ${suspectName}`,
              `**Reason:** ${reason}`,
              description ? `**Description:** ${description}` : null,
              vehicleLine ? `**Vehicle:** ${vehicleLine}` : null,
              lastSeen ? `**Last Seen:** ${lastSeen}` : null,
            ].filter(Boolean).join('\n');

            const boloEmbed = new EmbedBuilder()
              .setColor('#faa61a')
              .setTitle('BOLO Issued - Be On the Lookout')
              .setDescription(boloDesc)
              .setFooter({ text: 'RPM • Dispatch' })
              .setTimestamp();

            await dispCh.send({ content: '@here', embeds: [boloEmbed] }).catch(() => {});
          }
        }

        // Create DB record if character was found
        if (boloCharacter) {
          try {
            const { v4: uuidv4 } = await import('uuid');
            const boloRecord = new BOLO({
              guildId: guild.id,
              boloId: `VOICE-${uuidv4().slice(0, 8).toUpperCase()}`,
              characterId: boloCharacter._id,
              characterName: boloCharacter.fullName,
              reason,
              description,
              issuedBy: 'AI Dispatch',
              vehicles: vehicleLine ? [{
                color: args.vehicle_color || '',
                make: args.vehicle_make || '',
                model: args.vehicle_model || '',
                licensePlate: args.license_plate || '',
              }] : [],
            });
            await boloRecord.save();
            console.log(`[Dispatch AI] BOLO created for ${boloCharacter.fullName} (DB record saved)`);
          } catch (err) {
            console.error('[Dispatch AI] BOLO DB save failed:', err.message);
          }
        }

        console.log(`[Dispatch AI] BOLO issued for ${suspectName} - ${reason}`);
      }

    } catch (err) {
      console.error(`[Dispatch AI] Action "${action.name}" failed:`, err.message);
    }
  }
}

async function generateDispatchResponse(officerName, parsed, guildId, fullVoiceContext, guild, config, detectedCallSign = null, officerDbStatus = null) {
  if (parsed.code && SIMPLE_ACK_CODES.has(parsed.code) && !parsed.subject && !parsed.location) {
    const label = TEN_CODES[parsed.code]?.label || parsed.code;
    return { text: `10-4 ${cleanNameForTTS(officerName)}, copy ${label}.`, actions: [] };
  }

  // Pull all context in parallel - active calls + full officer roster + active BOLOs
  let activeCalls = [], allStatuses = [], activeBolos = [];
  try {
    [activeCalls, allStatuses, activeBolos] = await Promise.all([
      EmergencyCall.find({ guildId, status: 'active' }).sort({ timestamp: -1 }).limit(8).lean(),
      OfficerStatus.find({ guildId }).sort({ updatedAt: -1 }).lean(),
      BOLO.find({ guildId, active: true }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);
  } catch {}

  // Roster - include shift time so dispatcher can reference it
  const now = Date.now();
  const rosterLines = allStatuses.length > 0
    ? allStatuses.map(s => {
        const name = cleanNameForTTS(s.username);
        const mins = s.updatedAt ? Math.floor((now - new Date(s.updatedAt).getTime()) / 60000) : null;
        const shiftStr = mins !== null && mins < 600 ? ` (${mins}m ago)` : '';
        const detail = [s.subject && `with ${s.subject}`, s.location && `at ${s.location}`]
          .filter(Boolean).join(', ');
        return `  ${name}: ${s.tenCode || '10-8'}${detail ? ` (${detail})` : ''}${shiftStr}`;
      }).join('\n')
    : '  No units logged on.';

  // Active calls - include attached officers and any notes
  const callLines = activeCalls.map(c => {
    const callNum = c.callId?.split('-').pop() || '???';
    let line = `  Call #${callNum}: ${c.issue || 'unknown'}`;
    if (c.location) line += ` at ${c.location}`;
    if (c.suspectsDescription) line += ` - Suspect: ${c.suspectsDescription}`;
    const responder = allStatuses.find(s => s.userId === c.respondingLeoId);
    const attached = (c.attachedLeoIds || []).map(id => allStatuses.find(s => s.userId === id)?.username).filter(Boolean);
    if (responder) line += ` - Primary: ${cleanNameForTTS(responder.username)}`;
    if (attached.length) line += ` - Backup: ${attached.map(cleanNameForTTS).join(', ')}`;
    if (!responder) line += ' - UNATTENDED';
    return line;
  });
  const callContext = callLines.length > 0 ? callLines.join('\n') : '  None.';

  // Active BOLOs
  const boloLines = activeBolos.map(b => {
    let line = `  BOLO: ${b.characterName} - ${b.reason}`;
    if (b.description) line += ` (${b.description})`;
    if (b.vehicles?.length) {
      const v = b.vehicles[0];
      line += ` | Vehicle: ${[v.color, v.year, v.make, v.model].filter(Boolean).join(' ')}`;
      if (v.licensePlate) line += ` plate ${v.licensePlate}`;
    }
    return line;
  });
  const boloContext = boloLines.length > 0 ? boloLines.join('\n') : '  None.';

  // Active pursuit
  const pursuitInfo = activePursuitAlerts.get(guildId);
  const pursuitLine = pursuitInfo
    ? `  ACTIVE PURSUIT: Officer ${cleanNameForTTS(pursuitInfo.officerName)} - started ${Math.floor((now - pursuitInfo.timestamp) / 60000)}m ago`
    : '  None.';

  // Channel names for AI awareness
  const stopChannelNames = (config?.trafficStopChannelIds || [])
    .map(id => guild?.channels.cache.get(id)?.name).filter(Boolean).join(', ');
  const patrolChannelNames = (config?.patrolChannelIds || [])
    .map(id => guild?.channels.cache.get(id)?.name).filter(Boolean).join(', ');

  const ttsOfficerName = cleanNameForTTS(officerName);
  const callText = parsed.rawText || parsed.code || 'unknown';
  const userSaid = fullVoiceContext || callText;
  const callSignLine = detectedCallSign ? `SPEAKING OFFICER CALL SIGN: ${detectedCallSign}\n` : '';

  const ON_SCENE_STATUS_CODES = new Set(['10-11', '10-97', '10-50', '10-31', '10-52', '10-80', '10-78', '10-99']);
  let officerStatusBlock = '';
  const hasKnownStatus = officerDbStatus?.tenCode;
  if (officerDbStatus && hasKnownStatus) {
    const code = officerDbStatus.tenCode;
    const codeLabel = TEN_CODES[code]?.label || code;
    const minsOnStatus = officerDbStatus.updatedAt
      ? Math.floor((now - new Date(officerDbStatus.updatedAt).getTime()) / 60000)
      : null;
    const timeStr = minsOnStatus !== null ? ` for ${minsOnStatus}m` : '';
    const subjectStr = officerDbStatus.subject ? ` with ${officerDbStatus.subject}` : '';
    const locationStr = officerDbStatus.location ? ` at ${officerDbStatus.location}` : '';
    officerStatusBlock =
      `SPEAKING OFFICER PRIOR STATUS (before this transmission):\n` +
      `  ${ttsOfficerName}: ${code} - ${codeLabel}${subjectStr}${locationStr}${timeStr}\n` +
      `  Use this to give context-aware responses (e.g. if they go 10-8 from a stop, say "stop is clear").\n` +
      `  Do NOT ask the officer what their status is - they just told you via this transmission.\n\n`;
  } else {
    officerStatusBlock =
      `SPEAKING OFFICER PRIOR STATUS: No prior status on file for ${ttsOfficerName}.\n` +
      `  Do NOT ask for their status unprompted - respond to what they said first.\n\n`;
  }

  // Available units (10-8) for dispatch to assign to calls
  const availableOfficers = allStatuses.filter(s => !s.tenCode || s.tenCode === '10-8');
  const availableNames = availableOfficers.map(s => cleanNameForTTS(s.username)).join(', ');

  // Unattended active calls
  const unattendedCalls = activeCalls.filter(c => !c.respondingLeoId);
  const unattendedLines = unattendedCalls.map(c => {
    const num = c.callId?.split('-').pop() || '?';
    return `Call #${num}: ${c.issue || 'unknown'}${c.location ? ` at ${c.location}` : ''}`;
  });

  // Officers on scene together (for coordination context)
  const multiOfficerCalls = activeCalls.filter(c => c.respondingLeoId && (c.attachedLeoIds?.length ?? 0) > 0);

  const hasPursuit = !!pursuitInfo;

  const systemPrompt =
    `You are the radio dispatcher for a GTA 5 FiveM roleplay police server. ` +
    `You are a seasoned, emotionless professional. Flat delivery. No enthusiasm, no warmth, no filler. ` +
    `Strictly clinical. You acknowledge and inform - nothing more.\n\n` +
    officerStatusBlock +
    `UNITS ON DUTY:\n${rosterLines}\n\n` +
    `AVAILABLE UNITS (10-8): ${availableNames || 'None'}\n\n` +
    `ACTIVE 911 CALLS:\n${callContext}\n\n` +
    `ACTIVE PURSUIT:\n${pursuitLine}\n\n` +
    `ACTIVE BOLOs:\n${boloContext}\n\n` +
    (unattendedLines.length > 0 ? `UNATTENDED CALLS:\n  ${unattendedLines.join('\n  ')}\n\n` : '') +
    (stopChannelNames ? `TRAFFIC STOP CHANNELS: ${stopChannelNames}\n` : '') +
    (patrolChannelNames ? `PATROL CHANNELS: ${patrolChannelNames}\n` : '') +
    callSignLine +
    `\nRADIO STYLE - CRITICAL:\n` +
    `- Sound like a REAL dispatcher. Short. Clipped. Dry. Zero personality.\n` +
    `- Maximum 1–2 sentences. Never more. Shorter is always better.\n` +
    `- Address officer by first name or call sign. "Copy, Smith." "Ten-four, Adam-22."\n` +
    `- Speak ten-codes as words: "ten four", "ten eleven", "ten eighty", "ten eight", "ten ninety-nine".\n` +
    `- Never ask multiple questions. Never volunteer unrelated info unprompted.\n` +
    `- If transmission is unclear: "Say again?"\n` +
    `- Never explain yourself. Never recap what the officer said.\n` +
    `- Zero filler. Zero pleasantries. Zero enthusiasm. Zero "I'll do that right away". Zero "great" or "perfect".\n` +
    `- No excitement, no urgency in tone - flat, even on emergencies. The words carry urgency, not your voice.\n` +
    `- Non-police, off-topic speech: respond with nothing (empty string).\n` +
    `- GTA V locations: Los Santos, Blaine County, Pillbox Medical, Mirror Park, Legion Square, Davis, Sandy Shores, Paleto Bay, Vespucci, Del Perro, Vinewood, Rockford Hills, La Mesa.\n\n` +
    (hasPursuit
      ? `PURSUIT IN PROGRESS - DISPATCH RULES:\n` +
        `- There is an active ten-eighty pursuit. Only respond to pursuit-related traffic.\n` +
        `- Ignore routine status updates from other officers unless they are offering to assist.\n` +
        `- Keep responses extra short - officers need the channel clear.\n\n`
      : '') +
    `WHEN NOT TO RESPOND:\n` +
    `- Officer-to-officer banter, casual chat, non-police topics - stay silent.\n` +
    `- Simple ten-four acknowledgments from the officer - no need to respond.\n` +
    `- Officer just gave their status - do NOT ask for it again in the same response.\n` +
    `- If officer's prior status matches what they just said - acknowledge briefly, do not repeat info back.\n\n` +
    `CONTEXT-AWARE 10-8 RESPONSES:\n` +
    `- Coming from ten-eleven (traffic stop): "Copy ${ttsOfficerName}, showing you ten eight. Stop is clear."\n` +
    `- Coming from ten-ninety-seven (on scene): "Copy ${ttsOfficerName}, ten eight. You're clear."\n` +
    `- Coming from ten-eighty (pursuit): "Copy ${ttsOfficerName}, showing you ten eight. Pursuit concluded."\n` +
    `- No prior status / from patrol: "Ten-four ${ttsOfficerName}, showing you ten eight."\n` +
    `- If unattended calls exist when going ten-eight: "Copy, ten eight. ${unattendedLines[0] ? `Got a ${unattendedLines[0]} if you're free.` : ''}"\n\n` +
    `RESPONSE EXAMPLES (model these exactly):\n` +
    `- Officer says "ten eleven": "Copy ${ttsOfficerName}, ten eleven."\n` +
    `- Officer says "ten ninety-seven": "Copy, ten ninety-seven."\n` +
    `- Officer says "ten seventy-six": "Copy, ten seventy-six. En route."\n` +
    `- Officer requests backup: "Copy. ${availableNames ? availableNames.split(',')[0] : 'Any available unit'}, respond?"\n` +
    `- Officer reports a plate/name: read back the result cleanly, one sentence.\n\n` +
    `FUNCTION RULES:\n` +
    `- Call functions silently. NEVER write function names or JSON in your text response.\n` +
    `- Spoken response = natural radio only. No brackets, tags, or code.\n` +
    `WHEN TO CALL FUNCTIONS:\n` +
    `- move_to_traffic_stop: officer calls ten-eleven\n` +
    `- move_to_patrol: officer goes ten-eight or clears a scene\n` +
    `- update_officer_status: any verbal status change\n` +
    `- close_call: officer says code four or clears a call\n` +
    `- send_unit_to_call: assigning an officer to a call\n` +
    `- add_call_note: officer reports suspect, vehicle, or location info\n` +
    `- flag_officer_needs_backup: officer calls for help\n` +
    `- create_bolo: officer puts out a BOLO over radio`;

  // Tool definitions
  const dispatchTools = [
    {
      type: 'function',
      function: {
        name: 'move_to_traffic_stop',
        description: 'Ask officer if they want to move to an available traffic stop voice channel (never force)',
        parameters: {
          type: 'object',
          properties: {
            officer_name: { type: 'string', description: 'First name or display name of the officer' },
          },
          required: ['officer_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'move_to_patrol',
        description: 'Move an officer back to the main patrol voice channel',
        parameters: {
          type: 'object',
          properties: {
            officer_name: { type: 'string' },
          },
          required: ['officer_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_officer_status',
        description: "Update an officer's ten-code status on the board",
        parameters: {
          type: 'object',
          properties: {
            officer_name: { type: 'string' },
            ten_code: { type: 'string', description: 'e.g. 10-8, 10-11, 10-80, 10-97, 10-76, 10-15' },
          },
          required: ['officer_name', 'ten_code'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'close_call',
        description: 'Mark an active 911 call as resolved (code four)',
        parameters: {
          type: 'object',
          properties: {
            call_number: { type: 'string', description: 'Short call number e.g. "42"' },
          },
          required: ['call_number'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'send_unit_to_call',
        description: 'Attach an available officer to an active 911 call as backup or primary responder',
        parameters: {
          type: 'object',
          properties: {
            officer_name: { type: 'string' },
            call_number: { type: 'string' },
          },
          required: ['officer_name', 'call_number'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_call_note',
        description: 'Add or update a detail on an active 911 call - suspects, vehicle, location, or general note',
        parameters: {
          type: 'object',
          properties: {
            call_number: { type: 'string' },
            note_type: {
              type: 'string',
              enum: ['suspects', 'location', 'vehicle', 'notes'],
            },
            note: { type: 'string', description: 'The detail to record' },
          },
          required: ['call_number', 'note_type', 'note'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'flag_officer_needs_backup',
        description: 'Set an officer to 10-78 (needs backup) when they explicitly call for units',
        parameters: {
          type: 'object',
          properties: {
            officer_name: { type: 'string' },
          },
          required: ['officer_name'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_bolo',
        description: 'Create a BOLO (Be On the Lookout) based on what the officer says over radio',
        parameters: {
          type: 'object',
          properties: {
            suspect_name: { type: 'string', description: 'Name of the suspect if known, otherwise "Unknown"' },
            reason: { type: 'string', description: 'Reason for the BOLO, e.g. "Armed robbery suspect"' },
            description: { type: 'string', description: 'Physical description of the suspect' },
            vehicle_color: { type: 'string' },
            vehicle_make: { type: 'string' },
            vehicle_model: { type: 'string' },
            license_plate: { type: 'string' },
            last_seen: { type: 'string', description: 'Last known location' },
          },
          required: ['suspect_name', 'reason'],
        },
      },
    },
  ];

  // Rolling session history - cleared on disconnect
  const radioLog = getRadioLog(guildId);
  const historyMessages = radioLog.flatMap(entry => [
    { role: 'user', content: `${entry.officer}: "${entry.said}"` },
    { role: 'assistant', content: entry.response },
  ]).slice(-4);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: `${ttsOfficerName}${detectedCallSign ? ` [${detectedCallSign}]` : ''}: "${userSaid}"` },
  ];

  let lastErr;
  const maxTries = Math.max(1, groqKeys.length);
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const { client, provider } = getAIClient();
    // llama-3.1-8b-instant is Groq's fastest model - dispatch replies are short,
    // clipped radio chatter so the smaller/faster model keeps up fine and cuts
    // response latency significantly vs the 70b model. OpenAI fallback unchanged.
    const model = provider === 'groq' ? 'llama-3.1-8b-instant' : 'gpt-4o-mini';
    const maxTokens = 60;
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: dispatchTools,
        tool_choice: 'auto',
        max_tokens: maxTokens,
        temperature: 0.15,
        frequency_penalty: 0.5,
      });
      const message = response.choices[0]?.message;
      let rawText = message?.content?.trim() || '';

      // Collect any tool calls the AI decided to make.
      // Groq's llama model sometimes embeds function calls directly in the text
      // as <function=name{...}</function> instead of proper tool_calls - parse
      // those out and strip them from the spoken response.
      const actions = [];

      // Parse inline function tags that some models emit in text
      const inlineFnRe = /<function=(\w+)([\s\S]*?)<\/function>/gi;
      let inlineMatch;
      while ((inlineMatch = inlineFnRe.exec(rawText)) !== null) {
        try {
          const fnName = inlineMatch[1];
          // Extract the JSON-like body between the function name and closing tag
          const bodyStr = inlineMatch[2].replace(/^[^{]*/, '').replace(/[^}]*$/, '');
          const args = JSON.parse(bodyStr);
          actions.push({ name: fnName, args });
        } catch {}
      }
      // Strip ALL inline function tags from the spoken text
      rawText = rawText
        .replace(/<function=\w+[\s\S]*?<\/function>/gi, '')
        .replace(/<\/?function[^>]*>/gi, '')
        .trim();

      // Some models (e.g. certain Groq configs) emit bare function calls directly in the
      // text as:  function_name{"key": "value"}  - with no XML wrapper.
      // Parse and strip those too so they never appear in the spoken dispatch response.
      const KNOWN_FN_NAMES = [
        'move_to_traffic_stop', 'move_to_patrol', 'update_officer_status',
        'close_call', 'send_unit_to_call', 'add_call_note',
        'flag_officer_needs_backup', 'create_bolo',
      ];
      const bareFnPattern = new RegExp(
        `\\b(${KNOWN_FN_NAMES.join('|')})\\s*(\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\})`,
        'g',
      );
      let bareMatch;
      // Use a copy to iterate since we'll mutate rawText
      const rawForScan = rawText;
      bareFnPattern.lastIndex = 0;
      while ((bareMatch = bareFnPattern.exec(rawForScan)) !== null) {
        try {
          const args = JSON.parse(bareMatch[2]);
          actions.push({ name: bareMatch[1], args });
        } catch {}
      }
      rawText = rawText.replace(bareFnPattern, '').trim();
      // Clean up any stray punctuation or quotes left after stripping
      rawText = rawText.replace(/["""'']\s*$/, '').replace(/^\s*["""'']/, '').trim();

      // If AI returns empty string, dispatch stays silent (off-topic / no response needed).
      // Only fall back to a canned reply if there was a genuine dispatch-relevant trigger.
      const text = rawText || '';

      // Also collect proper OpenAI-style tool_calls
      if (message?.tool_calls?.length) {
        for (const tc of message.tool_calls) {
          try { actions.push({ name: tc.function.name, args: JSON.parse(tc.function.arguments) }); } catch {}
        }
      }

      addToRadioLog(guildId, ttsOfficerName, userSaid, text);
      return { text, actions };
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

// Per-officer AI response cooldown - prevents double-triggers from the same
// officer's mic key landing as two near-identical transcriptions.
const _lastAIResponseTime = new Map(); // `${guildId}:${userId}` → timestamp

export async function processVoiceCall(wavBuffer, userId, guild, client, opts = {}) {
  try {
    /* Run the three independent lookups in parallel instead of sequentially */
    const [config, member, cadConfig] = await Promise.all([
      DispatchConfig.findOne({ guildId: guild.id }),
      guild.members.fetch(userId).catch(() => null),
      CADConfig.findOne({ guildId: guild.id }),
    ]);

    if (!config || !config.enabled || !config.dispatchChannelId) return;
    if (!member) return;

    const leoRoleIds = config.leoRoleIds?.length > 0 ? config.leoRoleIds : (cadConfig?.leoRoleIds ?? []);
    const isLeo = leoRoleIds.length === 0 || member.roles.cache.some(r => leoRoleIds.includes(r.id));
    if (!isLeo) return;

    const officerName = member.displayName || member.user.username;
    const ttsName = cleanNameForTTS(officerName);
    // Processing audio (debug-level, suppressed in production)

    let transcript = '';
    try {
      transcript = await transcribeAudio(wavBuffer);
    } catch (err) {
      console.error('[Dispatch] Transcription error:', err.message);
      return;
    }

    if (!transcript || transcript.trim().length < 3) return;

    // ── Noise / Whisper hallucination filter ─────────────────────────────────
    {
      const _t = transcript.trim();
      const _words = _t.split(/\s+/).filter(Boolean);
      if (_words.length < 2) {
        // Dropping single-word noise (debug-level, suppressed)
        return;
      }
      const FILLER = new Set(['uh','um','hmm','hm','ah','oh','eh','er','okay','ok',
        'yeah','yep','nah','hey','yo','hi','hello','bye','thanks','thank','sure',
        'right','alright','cool','nice','wow','huh','what','yep','nope','mhm']);
      if (_words.every(w => FILLER.has(w.toLowerCase().replace(/[^a-z]/g, '')))) {
        console.log(`[Dispatch] Dropping pure filler: "${_t}"`);
        return;
      }
      const _unique = new Set(_words.map(w => w.toLowerCase().replace(/[^a-z]/g, '')));
      if (_words.length >= 3 && _unique.size === 1) {
        console.log(`[Dispatch] Dropping repeated-word hallucination: "${_t}"`);
        return;
      }
      if (/^(?:(?:thank(?:s| you)[.,!]*\s*){2,}|(?:thanks?\s*){3,})$/i.test(_t)) {
        console.log(`[Dispatch] Dropping thank-you loop: "${_t}"`);
        return;
      }
      if (/^[.\s]+$/.test(_t)) {
        console.log(`[Dispatch] Dropping ellipsis noise: "${_t}"`);
        return;
      }
      const _nonAscii = (_t.match(/[^\x00-\x7F]/g) || []).length;
      if (_nonAscii / _t.length > 0.3) {
        console.log(`[Dispatch] Dropping non-ASCII transcript: "${_t}"`);
        return;
      }

      // ── Known Whisper exact-phrase hallucinations ────────────────────────────
      // Whisper reliably generates these strings from silence or ambient noise
      // when conditioned with a police-radio prompt. Block them when the entire
      // transcript is nothing but one of these phrases.
      const _norm = _t.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const EXACT_HALLUCINATIONS = new Set([
        'thank you', 'thanks', 'thank you for watching', 'thanks for watching',
        'thank you for listening', 'thanks for listening', 'please subscribe',
        'subscribe', 'you', 'i', 'the',
      ]);
      if (EXACT_HALLUCINATIONS.has(_norm)) {
        console.log(`[Dispatch] Dropping known Whisper hallucination: "${_t}"`);
        return;
      }

      // ── Cross-user hallucination suppressor ──────────────────────────────────
      // If the same short transcript (≤ 4 words) is produced by 2 or more
      // different users within 12 seconds, it is almost certainly Whisper
      // hallucinating from shared ambient channel noise, not real speech.
      // Real officers don't key up and say the identical thing seconds apart.
      // Only suppress very short (≤2 word) identical phrases across users within 5s.
      // Longer phrases like "dispatch ten eight" are almost certainly real speech from
      // different officers who happened to say the same thing - do NOT suppress those.
      if (_words.length <= 2) {
        const _suppressKey = `${guild.id}:${_norm}`;
        const _now = Date.now();
        const _entry = _crossUserHallucinationTracker.get(_suppressKey);
        if (_entry) {
          const { firstUserId, firstTs } = _entry;
          if (_now - firstTs < 5000 && firstUserId !== userId) {
            // Second different user with same 1-2 word phrase within 5s → suppress
            _crossUserHallucinationTracker.delete(_suppressKey);
            console.log(`[Dispatch] Cross-user hallucination suppressed: "${_t}" (2 users, ${_now - firstTs}ms apart)`);
            return;
          }
          if (_now - firstTs >= 5000) {
            _crossUserHallucinationTracker.set(_suppressKey, { firstUserId: userId, firstTs: _now });
          }
        } else {
          _crossUserHallucinationTracker.set(_suppressKey, { firstUserId: userId, firstTs: _now });
          if (_crossUserHallucinationTracker.size > 200) {
            const cutoff = _now - 30000;
            for (const [k, v] of _crossUserHallucinationTracker) {
              if (v.firstTs < cutoff) _crossUserHallucinationTracker.delete(k);
            }
          }
        }
      }
    }
    // ── End noise filter ──────────────────────────────────────────────────────

    console.log(`[Dispatch] Transcript: "${transcript}"`);

    // Dedup: ignore identical transcripts from the same user within 8 seconds
    const dedupKey = `${guild.id}:${userId}`;
    const now = Date.now();
    const lastEntry = _transcriptDedup.get(dedupKey);
    const normalized = transcript.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
    if (lastEntry && (now - lastEntry.ts < 6000) && lastEntry.text === normalized) {
      console.log(`[Dispatch] Dedup - ignoring repeated transcript from ${officerName}`);
      return;
    }
    _transcriptDedup.set(dedupKey, { ts: now, text: normalized });

    // ── Per-officer AI response cooldown ─────────────────────────────────────
    // If the same officer triggered a response in the last 3 seconds, ignore
    // this transmission entirely - it's almost certainly a double-keying artifact.
    const aiCooldownKey = `${guild.id}:${userId}`;
    const _nowCooldown = Date.now();
    const _lastAI = _lastAIResponseTime.get(aiCooldownKey) || 0;
    if (_nowCooldown - _lastAI < 3000) {
      console.log(`[Dispatch] Cooldown - ignoring rapid repeat from ${officerName} (${_nowCooldown - _lastAI}ms since last)`);
      return;
    }

    if (await handlePendingStopMoveVoiceAnswer(guild, config, member, transcript, ttsName)) return;

    // --- Active broadcast respond detection (works WITHOUT saying "dispatch") ---
    // If there's an active call broadcast, any officer saying "respond" attaches to it
    {
      const broadcast = activeBroadcastCalls.get(guild.id);
      if (broadcast && (Date.now() - broadcast.timestamp) < 5 * 60 * 1000) {
        if (detectRespondToBroadcast(transcript.trim())) {
          console.log(`[Dispatch] ${officerName} responding to active broadcast call #${broadcast.callNum}`);
          try {
            const call = await EmergencyCall.findOne({ guildId: guild.id, callId: broadcast.callId, status: 'active' });
            if (call) {
              const alreadyOn = call.respondingLeoId === userId || call.attachedLeoIds?.includes(userId);
              if (!alreadyOn) {
                if (!call.respondingLeoId) {
                  call.respondingLeoId = userId;
                  call.respondingLeoUsername = officerName;
                } else {
                  call.attachedLeoIds = call.attachedLeoIds || [];
                  call.attachedLeoIds.push(userId);
                }
                await call.save();

                await updateOfficerStatus(guild.id, userId, officerName, '10-76',
                  { code: '10-76', codeInfo: { label: '10-76 En Route' }, subject: null, location: broadcast.location, rawText: 'Responding to broadcast call' },
                  null, null);

                const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
                  await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
                if (dispatchCh?.isTextBased()) {
                  const embed = new EmbedBuilder()
                    .setColor('#43b581')
                    .setTitle(`Call #${broadcast.callNum} - Unit Responding`)
                    .setDescription(
                      `**<@${userId}> (${cleanNameForTTS(officerName)})** is responding to **Call #${broadcast.callNum}**.\n` +
                      (broadcast.issue ? `**Incident:** ${broadcast.issue}\n` : '') +
                      (broadcast.location ? `**Location:** ${broadcast.location}\n` : '')
                    )
                    .setFooter({ text: 'RPM • Dispatch' })
                    .setTimestamp();
                  await dispatchCh.send({ embeds: [embed] }).catch(() => {});
                }

                if (config.aiEnabled && hasAIKey()) {
                  try {
                    const { playDispatchVoice } = await import('../utils/voiceListener.js');
                    const ttsText = `Copy ${ttsName}, ten seventy-six to call ${broadcast.callNum}.`;
                    const ttsBuffer = await generateDispatchTTS(ttsText);
                    playDispatchVoice(guild.id, ttsBuffer);
                  } catch {}
                }

                await rebuildStatusBoard(guild, config);
              } else {
                if (config.aiEnabled && hasAIKey()) {
                  try {
                    const { playDispatchVoice } = await import('../utils/voiceListener.js');
                    const ttsBuffer = await generateDispatchTTS(`${ttsName}, already showing you on call ${broadcast.callNum}.`);
                    playDispatchVoice(guild.id, ttsBuffer);
                  } catch {}
                }
              }
            }
          } catch (err) {
            console.error('[Dispatch] Broadcast respond error:', err.message);
          }
          return;
        }
      }
    }
    // --- End broadcast respond detection ---

    // --- Release stop detection ---
    // Must run before detectJoinStop so "releasing John Smith" isn't caught as a new stop
    if (detectReleaseStop(transcript)) {
      const officerStatus = await OfficerStatus.findOne({ guildId: guild.id, userId });
      if (officerStatus?.tenCode === '10-11') {
        const stopMins = officerStatus.trafficStopStartAt
          ? Math.floor((Date.now() - new Date(officerStatus.trafficStopStartAt).getTime()) / 60000)
          : 0;

        await updateOfficerStatus(guild.id, userId, officerName, '10-8',
          { code: '10-8', codeInfo: TEN_CODES['10-8'], subject: null, location: null, rawText: transcript },
          null, null);

        const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
        let ttsRelease = `Copy ${ttsName}, stop is clear`;
        if (stopMins > 0) ttsRelease += ` - ${stopMins} minute${stopMins !== 1 ? 's' : ''} on stop`;
        ttsRelease += `. Ten eight shown.`;
        addToRadioLog(guild.id, cleanNameForTTS(officerName), transcript, ttsRelease);
        const ttsPRelease = startTTS(ttsRelease, config);

        if (dispatchCh?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#43b581')
            .setTitle('Traffic Stop Released')
            .setDescription(
              `**Officer:** <@${userId}>\n` +
              (stopMins > 0 ? `**Stop Duration:** ${stopMins} minute${stopMins !== 1 ? 's' : ''}\n` : '') +
              `Showing **10-8 Available**.`
            )
            .setFooter({ text: 'RPM • Dispatch' })
            .setTimestamp();
          await dispatchCh.send({ embeds: [embed] }).catch(() => {});
        }

        await playTTS(ttsPRelease, guild.id);
        await rebuildStatusBoard(guild, config);
        return;
      }
    }
    // --- End release stop ---

    // fullVoiceContext = everything the officer said (pre + post trigger)
    // transcript = only what came after the trigger (used for command detection)
    // hadTrigger = true when a real dispatch trigger (word, call sign, or emergency phrase) was detected
    let fullVoiceContext = null;
    let detectedCallSign = null;
    let hadTrigger = false;
    {
      const raw = transcript.trim();

      // ── Emergency bypass - always process regardless of trigger word ──────
      if (EMERGENCY_BYPASS_RE.test(raw)) {
        transcript = raw;
        fullVoiceContext = raw;
        hadTrigger = true;
        console.log(`[Dispatch] Emergency phrase detected - bypassing trigger requirement`);
        // Fall through to processing below
      } else {
        // Check for call sign at the very start - e.g. "1 Adam 22, show me 10-8"
        const callSignResult = detectCallSign(raw);

        // Split into original words (preserves numbers/punctuation for commandText)
        // and alpha-only words (for trigger detection only)
        const rawWords = raw.split(/\s+/);
        const alphaWords = rawWords.map(w => w.toLowerCase().replace(/[^a-z]/g, ''));

        // Search up to word 7 (not just 4) - officers sometimes say their unit number first.
        // Case-insensitive (alphaWords is already lowercased) and tolerant of Whisper
        // mishearings/variations: "dispatched", "dispatchers", "this patch", "despatch", "depatch", etc.
        const dispatchIdx = alphaWords.findIndex((w, i) => i <= 7 && (
          w.startsWith('dispatch') || w.endsWith('dispatch') ||
          w === 'despatch' || w === 'depatch' || w === 'thispatch' ||
          w === 'command' || w === 'control' || w === 'central'
        ));

        let preContext = '';
        let commandText = '';

        if (callSignResult && callSignResult.remainder.trim().length > 2) {
          // Officer opened with their call sign - the remainder is the command for dispatch
          detectedCallSign = callSignResult.callSign;
          commandText = callSignResult.remainder.trim();
          hadTrigger = true;
          console.log(`[Dispatch] Call sign: "${detectedCallSign}" - command: "${commandText}"`);
        } else if (dispatchIdx !== -1) {
          // Use ORIGINAL rawWords to preserve ten-codes / numbers in the command
          preContext = rawWords.slice(0, dispatchIdx).join(' ').trim();
          commandText = rawWords.slice(dispatchIdx + 1).join(' ').trim();
          hadTrigger = true;
          console.log(`[Dispatch] Trigger "${alphaWords[dispatchIdx]}" found at word ${dispatchIdx} - command: "${commandText}"`);
        } else {
          // No trigger word or call sign detected.
          // Check if we're in roll call mode - if so, allow bare status codes through.
          const rollCallExpiry = statusRollCallMode.get(guild.id);
          if (rollCallExpiry && Date.now() < rollCallExpiry) {
            const normalized = normalizeSpokenCodes(raw);
            if (ROLL_CALL_STATUS_RE.test(normalized)) {
              hadTrigger = true;
              transcript = raw;
              fullVoiceContext = raw;
              console.log(`[Dispatch] Roll call mode - bare status from ${officerName}: "${raw.slice(0, 40)}"`);
            } else {
              console.log(`[Dispatch] Ignoring - no trigger in roll call window: "${raw.slice(0, 60)}"`);
              return;
            }
          } else {
            if (rollCallExpiry) statusRollCallMode.delete(guild.id); // expired, clean up
            console.log(`[Dispatch] Ignoring - no trigger word detected in: "${raw.slice(0, 60)}"`);
            return;
          }
        }

        // If nothing came after the trigger (e.g. "One Adam 84 to dispatch"),
        // use the pre-trigger context so the bot can acknowledge the officer.
        if (commandText.length < 2) {
          if (preContext.length > 2) {
            commandText = preContext;
            preContext = '';
          } else {
            return;
          }
        }
        transcript = commandText;
        fullVoiceContext = preContext ? `${preContext}, ${commandText}` : commandText;
        // Transcript ready (debug-level, suppressed)
      }
    }

    // --- Dispatch-relevance gate ---
    // If a trigger word was heard but the command contains zero dispatch vocabulary,
    // drop it silently. This prevents the bot from responding to off-topic chatter
    // like "dispatch, can you help me move?" or accidental trigger-word hits.
    if (hadTrigger && !isDispatchRelevant(transcript)) {
      // Trigger heard but off-topic (debug-level, suppressed)
      return;
    }
    // --- End relevance gate ---

    // --- "Show me in / show me on" join-stop detection ---
    const joinTargetName = hadTrigger ? detectJoinStop(transcript) : null;
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

        const civName = cleanNameForTTS(civMember?.displayName || civMember?.user?.username || joinTargetName);
        const ttsJoin = `Copy ${ttsName}, ten eleven with ${civName}. Move you both to a stop channel?`;
        addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsJoin);
        const ttsPJoin = startTTS(ttsJoin, config);

        await rebuildStatusBoard(guild, config);
        await playTTS(ttsPJoin, guild.id);
      } else {
        // No available stop channel - still log the stop and give TTS feedback
        await updateOfficerStatus(guild.id, userId, officerName, '10-11',
          { code: '10-11', codeInfo: TEN_CODES['10-11'], subject: joinTargetName, location: null, rawText: transcript },
          null, null);
        const civNameFb = cleanNameForTTS(civMember?.displayName || civMember?.user?.username || joinTargetName);
        const ttsFb = `Copy ${ttsName}, ten eleven with ${civNameFb}. No stop channels open right now.`;
        addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsFb);
        const ttsPFb = startTTS(ttsFb, config);
        await rebuildStatusBoard(guild, config);
        await playTTS(ttsPFb, guild.id);
      }
      return;
    }
    // --- End join-stop detection ---

    // --- CAD lookup detection (run plate / run name) ---
    const cadLookup = hadTrigger ? detectCADLookup(transcript) : null;
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
            embed.addFields({ name: 'Result', value: 'No records found - plate is not registered in the system', inline: false });
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
              const vList = result.embed.vehicles.map(v => `${v.color || ''} ${v.year || ''} ${v.make || ''} ${v.model || ''} - ${v.licensePlate || 'No Plate'}`.trim()).join('\n');
              embed.addFields({ name: 'Vehicles', value: vList, inline: false });
            }
            if (result.embed.hasBolo) {
              embed.addFields({ name: 'BOLO', value: result.embed.boloReason, inline: false });
            }
          } else {
            embed.addFields({ name: 'Result', value: 'No records found - name is not in the system', inline: false });
          }
          embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });
          await dispatchChannel.send({ embeds: [embed] }).catch((e) => console.error('[CAD Lookup] Failed to send name embed:', e.message));
        }
      } else {
        console.error(`[CAD Lookup] Dispatch channel not found: ${config.dispatchChannelId}`);
      }

      console.log(`[CAD Lookup] Generating TTS response: "${result.ttsResponse}"`);
      if (config.aiEnabled && hasAIKey()) {
        /* Start TTS generation in parallel with the embed send above */
        await playTTS(startTTS(result.ttsResponse, config), guild.id);
      } else {
        console.log(`[CAD Lookup] TTS skipped - aiEnabled=${config.aiEnabled}, hasKey=${hasAIKey()}`);
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
          const ttsNoCall = `Negative ${ttsName}, there are no active nine one one calls at this time.`;
          addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsNoCall);
          if (config.aiEnabled && hasAIKey()) {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(ttsNoCall);
            playDispatchVoice(guild.id, ttsBuffer);
          }
          return;
        }

        const callNum = call.callId?.split('-').pop() || '???';
        const alreadyAttached = call.attachedLeoIds?.includes(userId);
        const isPrimary = call.respondingLeoId === userId;

        if (alreadyAttached || isPrimary) {
          console.log(`[Dispatch] ${officerName} already on call #${callNum}`);
          const ttsAlready = `${ttsName}, you are already ${isPrimary ? 'primary responder' : 'attached'} on call number ${callNum}.`;
          addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsAlready);
          if (config.aiEnabled && hasAIKey()) {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(ttsAlready);
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
            .setTitle(`Unit ${role === 'primary responder' ? 'Responding' : 'Attached'} - Call #${callNum}`)
            .setDescription(
              `**Officer:** <@${userId}>\n` +
              `**Call:** #${callNum} - ${call.issue || 'Unknown'}\n` +
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

        const ttsAttach = `Copy ${ttsName}, showing you as ${role} on call number ${callNum}. ${call.issue || ''} at ${call.location || 'unknown location'}.`;
        addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsAttach);
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(ttsAttach);
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
            `Copy ${ttsName}, here is what I can do as your AI dispatch.`,
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
        console.log(`[Dispatch] ${responderName} verbally responding to pursuit`);

        if (config.dispatchChannelId) {
          const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
            await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
          if (dispatchCh?.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('10-80 - Unit Responding')
              .setDescription(
                `**<@${userId}> (${cleanNameForTTS(responderName)})** is responding to the pursuit.\n` +
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
            const ttsText = `Copy ${cleanNameForTTS(responderName)}, ten seventy-six to back up ${cleanNameForTTS(pursuitAlert.officerName)}.`;
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
    const attachStopPattern = /\b(?:attach|send|move|put)\s+me\s+(?:to|with)\s+([\w]+(?:\s+[\w]+)?)(?:'s?)?\s+(?:10[-\s]?11|stop|traffic\s+stop|pullover|scene)\b/i;
    const attachStopMatch = transcript.match(attachStopPattern);
    if (attachStopMatch) {
      const sceneName = attachStopMatch[1].toLowerCase().trim(); // officer on scene

      // Find the scene officer's active stop channel - match on cleaned name or first name
      const allStatuses = await OfficerStatus.find({ guildId: guild.id, tenCode: '10-11' });
      const sceneOfficer = allStatuses.find(s => {
        const cleanStored = cleanNameForTTS(s.username).toLowerCase();
        const firstName = cleanStored.split(' ')[0];
        return cleanStored.includes(sceneName) || sceneName.includes(cleanStored) ||
          (firstName.length > 2 && sceneName.startsWith(firstName));
      });
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
              const ttsText = `Copy ${ttsName}, moving you to ${cleanNameForTTS(sceneOfficer.username)}'s stop.`;
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
            const ttsText = `Negative ${ttsName}, no active stop found for ${sceneName}.`;
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
            const ttsText = `Copy ${ttsName}, staying on your channel for ${durationMin} minute${durationMin !== 1 ? 's' : ''}.`;
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
    const warrantTarget = hadTrigger ? detectWarrantCheck(transcript) : null;
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
            { name: 'Warrant Status', value: isWanted ? '**WANTED** - Active warrants on file' : 'No active warrants', inline: false },
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
        tts = `Negative ${ttsName}, no records for ${warrantTarget}.`;
      } else if (result.embed.status === 'WANTED') {
        tts = `${ttsName}, ${result.embed.name} is showing WANTED. Use caution.`;
        if (result.embed.hasBolo) tts += ` Active BOLO: ${result.embed.boloReason}.`;
      } else {
        tts = `${ttsName}, ${result.embed.name} comes back clear.`;
        if (result.embed.hasBolo) tts += ` Note: active BOLO on file.`;
      }
      addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, tts);
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
    const serialQuery = hadTrigger ? detectSerialLookup(transcript) : null;
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
          embed.addFields({ name: 'Result', value: 'No records found - serial not registered in system', inline: false });
          tts = `Serial ${serialQuery.split('').join(' ')} comes back with no records. Firearm is not registered in the system. Use caution.`;
        }
        embed.addFields({ name: 'Officer Said', value: `*"${transcript.trim()}"*`, inline: false });
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }
      if (tts) {
        addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, tts);
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(tts);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) { console.error('[Dispatch TTS] Serial lookup error:', err.message); }
        }
      }
      return;
    }
    // --- End serial lookup ---

    // --- Backup request detection ---
    const backupReq = hadTrigger ? detectBackupRequest(transcript) : null;
    if (backupReq) {
      console.log(`[Dispatch] Backup requested by ${officerName}${backupReq.location ? ` at ${backupReq.location}` : ''}`);
      const allStatuses = await OfficerStatus.find({ guildId: guild.id });
      const available = allStatuses.filter(s => s.tenCode === '10-8' && s.userId !== userId);

      await updateOfficerStatus(guild.id, userId, officerName, '10-78',
        { code: '10-78', codeInfo: TEN_CODES['10-78'], subject: null, location: backupReq.location, rawText: transcript },
        null, null);

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

      let ttsBackup = `All units, ten seventy eight. ${ttsName} requesting backup`;
      if (backupReq.location) ttsBackup += ` at ${backupReq.location}`;
      ttsBackup += '.';
      if (available.length > 0) {
        const firstAvail = cleanNameForTTS(available[0].username);
        ttsBackup += ` ${firstAvail}${available.length > 1 ? ` and ${available.length - 1} other${available.length > 2 ? 's' : ''}` : ''}, say responding.`;
      } else {
        ttsBackup += ' No units available.';
      }
      addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsBackup);
      const ttsPBackup = startTTS(ttsBackup, config);

      if (dispatchCh?.isTextBased()) {
        const availText = available.length > 0 ? available.map(o => o.username).join(', ') : 'None showing available';
        const embed = new EmbedBuilder()
          .setColor('#f04747')
          .setTitle('10-78 - Backup Requested')
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

      await playTTS(ttsPBackup, guild.id);
      await rebuildStatusBoard(guild, config);
      return;
    }
    // --- End backup request ---

    // --- 10-99 panic clear / stand-down detection ---
    if (hadTrigger && detectClearPanic(transcript)) {
      const officerStatus = await OfficerStatus.findOne({ guildId: guild.id, userId });
      if (officerStatus?.tenCode === '10-99') {
        console.log(`[Dispatch] 10-99 stand-down from ${officerName}`);
        await updateOfficerStatus(guild.id, userId, officerName, '10-8',
          { code: '10-8', codeInfo: TEN_CODES['10-8'], subject: null, location: null, rawText: transcript },
          null, null);
        await clearPanicAlert(guild, config, userId, officerName);
        const ttsStandDown = `All units, ten ninety nine is clear. ${ttsName} is ten eight. Stand down.`;
        addToRadioLog(guild.id, 'Dispatch', transcript, ttsStandDown);
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const ttsBuffer = await generateDispatchTTS(ttsStandDown);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) { console.error('[Dispatch TTS] Panic clear error:', err.message); }
        }
        await rebuildStatusBoard(guild, config);
        return;
      }
    }
    // --- End 10-99 panic clear ---

    // --- Code 4 / scene clear detection ---
    // Works with or without trigger word - "code four" is an unambiguous status update
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
          .setTitle('Code 4 - Scene Clear')
          .setDescription(`**Officer:** <@${userId}>\nScene is code four. Showing **10-8 Available**.`)
          .setFooter({ text: 'RPM • Dispatch' })
          .setTimestamp();
        await dispatchCh.send({ embeds: [embed] }).catch(() => {});
      }

      const ttsCode4 = `Copy ${ttsName}, code four. Ten eight shown.`;
      addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsCode4);
      if (config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(ttsCode4);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) { console.error('[Dispatch TTS] Code 4 error:', err.message); }
      }
      await rebuildStatusBoard(guild, config);
      return;
    }
    // --- End code 4 ---

    // --- Units available check ---
    if (hadTrigger && detectUnitsCheck(transcript)) {
      console.log(`[Dispatch] Units check requested by ${officerName}`);
      const allStatuses = await OfficerStatus.find({ guildId: guild.id });
      const available = allStatuses.filter(s => s.tenCode === '10-8');
      const onStop = allStatuses.filter(s => s.tenCode === '10-11');
      const inPursuit = allStatuses.filter(s => s.tenCode === '10-80');
      const total = allStatuses.length;

      let tts = `${ttsName}, showing ${total} unit${total !== 1 ? 's' : ''} on duty. `;
      if (available.length > 0) {
        tts += `${available.length} available: ${available.map(o => cleanNameForTTS(o.username)).join(', ')}. `;
      } else {
        tts += 'No units currently showing available. ';
      }
      if (onStop.length > 0) tts += `${onStop.length} on traffic stop. `;
      if (inPursuit.length > 0) tts += `${inPursuit.length} in pursuit. `;
      addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, tts);
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
    const emsReq = hadTrigger ? detectEMSRequest(transcript) : null;
    if (emsReq) {
      console.log(`[Dispatch] ${emsReq.type.toUpperCase()} request by ${officerName}${emsReq.location ? ` at ${emsReq.location}` : ''}`);
      const serviceLabel = emsReq.type === 'fire' ? 'Fire Department' : 'EMS';
      const serviceColor = emsReq.type === 'fire' ? '#f59e0b' : '#5b9cf6';

      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
      let ttsEms = `Copy ${ttsName}, requesting ${serviceLabel}`;
      if (emsReq.location) ttsEms += ` to ${emsReq.location}`;
      ttsEms += `. ${serviceLabel}, please respond.`;
      addToRadioLog(guild.id, cleanNameForTTS(officerName), fullVoiceContext || transcript, ttsEms);
      const ttsPEms = startTTS(ttsEms, config);

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

      await playTTS(ttsPEms, guild.id);
      return;
    }
    // --- End EMS / Fire request ---

    // --- Voice 911 call creation ("roll me a 32", "I've got a robbery at...") ---
    const voiceCallReq = hadTrigger ? detectVoiceCallCreation(fullVoiceContext || transcript) : null;
    if (voiceCallReq) {
      console.log(`[Dispatch] Voice call creation: ${voiceCallReq.incident}${voiceCallReq.location ? ` at ${voiceCallReq.location}` : ''} (${voiceCallReq.count} unit(s))`);
      try {
        const callNum = `${Date.now().toString().slice(-5)}`;
        const callId = `${guild.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const newCall = new EmergencyCall({
          guildId: guild.id,
          callId,
          issue: voiceCallReq.incident,
          location: voiceCallReq.location || 'Unknown',
          reporterUsername: officerName,
          reporterId: userId,
          status: 'active',
          respondingLeoId: userId,
          respondingLeoUsername: officerName,
        });
        await newCall.save();

        // Track as active broadcast so available officers can say "respond"
        activeBroadcastCalls.set(guild.id, {
          callId,
          callNum,
          issue: voiceCallReq.incident,
          location: voiceCallReq.location,
          timestamp: Date.now(),
        });
        // Auto-expire broadcast after 5 minutes
        setTimeout(() => {
          const b = activeBroadcastCalls.get(guild.id);
          if (b?.callId === callId) activeBroadcastCalls.delete(guild.id);
        }, 5 * 60 * 1000);

        const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
          await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

        if (dispatchCh?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle(`Active Call #${callNum} - ${voiceCallReq.incident}`)
            .setDescription(
              `**Incident:** ${voiceCallReq.incident}\n` +
              (voiceCallReq.location ? `**Location:** ${voiceCallReq.location}\n` : '') +
              `**Reported By:** <@${userId}> (${cleanNameForTTS(officerName)})\n\n` +
              `Available units, say **"respond"** on the radio to attach to this call.`
            )
            .setFooter({ text: `RPM • Call #${callNum}` })
            .setTimestamp();
          await dispatchCh.send({ embeds: [embed] }).catch(() => {});
        }

        // Broadcast TTS to available officers
        if (config.aiEnabled && hasAIKey()) {
          try {
            const { playDispatchVoice } = await import('../utils/voiceListener.js');
            const locationPart = voiceCallReq.location ? ` at ${voiceCallReq.location}` : '';
            const unitsNeeded = voiceCallReq.count > 1 ? `${voiceCallReq.count} units` : 'any available unit';
            const ttsText = `Attention all units, attention all units - ${voiceCallReq.incident}${locationPart}. Call number ${callNum}. ${unitsNeeded} please respond. Say responding to attach.`;
            addToRadioLog(guild.id, 'Dispatch', transcript, ttsText);
            const ttsBuffer = await generateDispatchTTS(ttsText);
            playDispatchVoice(guild.id, ttsBuffer);
          } catch (err) {
            console.error('[Dispatch TTS] Voice call creation TTS error:', err.message);
          }
        }

        await updateOfficerStatus(guild.id, userId, officerName, '10-97',
          { code: '10-97', codeInfo: TEN_CODES['10-97'], subject: voiceCallReq.incident, location: voiceCallReq.location, rawText: transcript },
          null, null);
        await rebuildStatusBoard(guild, config);
      } catch (err) {
        console.error('[Dispatch] Voice call creation error:', err.message);
      }
      return;
    }
    // --- End voice 911 call creation ---

    const parsed = parseTranscript(transcript);

    const isSimpleAck = parsed.code && SIMPLE_ACK_CODES.has(parsed.code) && !parsed.subject && !parsed.location;

    // Fetch the officer's current DB status - passed to AI so it knows their active code/scene
    const officerDbStatus = await OfficerStatus.findOne({ guildId: guild.id, userId }).lean().catch(() => null);

    let dispatchResponse = null;
    let aiActions = [];
    // Skip AI for simple status transitions - these have instant pre-built TTS handlers
    // that are much faster than a GPT round-trip (~2-3s saved per call).
    const preComputedAction = parsed.codeInfo?.action;
    const skipAIForSpeed = preComputedAction === 'available' || preComputedAction === 'out_of_service';
    // Only generate an AI response when a real dispatch trigger was heard (trigger word,
    // call sign, or emergency phrase). Ten-codes spoken without a trigger word just
    // update the officer's status silently - no AI chat-back.
    //
    // Simultaneous speaker gate: if dispatch was already playing TTS when this
    // transmission landed, skip the AI response unless it is an emergency - this
    // prevents stale queued responses and avoids dispatch "talking over" itself.
    const _isEmergencyTransmission = EMERGENCY_BYPASS_RE.test(transcript);
    const _skipForSpeaking = opts.dispatchWasSpeaking && !_isEmergencyTransmission;
    if (_skipForSpeaking) {
      console.log(`[Dispatch] Simultaneous speaker gate - dispatch was speaking; skipping AI response for ${officerName}`);
    }
    if (hadTrigger && !isSimpleAck && !skipAIForSpeed && config.aiEnabled && hasAIKey() && !_skipForSpeaking) {
      try {
        _lastAIResponseTime.set(aiCooldownKey, Date.now());
        const aiResult = await generateDispatchResponse(officerName, parsed, guild.id, fullVoiceContext, guild, config, detectedCallSign, officerDbStatus);
        dispatchResponse = aiResult.text;
        aiActions = aiResult.actions || [];
        if (aiActions.length) console.log(`[Dispatch AI] ${aiActions.length} action(s) queued:`, aiActions.map(a => a.name).join(', '));
      } catch (err) {
        console.error('[Dispatch] AI response error:', err.message);
      }
    }

    // Start TTS immediately - runs in background while embed is built and sent
    const ttsPMain = (dispatchResponse && !isSimpleAck) ? startTTS(dispatchResponse, config) : null;

    // TTS was already generating - just play it now (usually already done)
    await playTTS(ttsPMain, guild.id);

    if (isSimpleAck) {
      console.log(`[Dispatch] Skipping TTS for simple ${parsed.code} acknowledgment (saving tokens)`);
    }

    // Execute AI-triggered actions (channel moves, status updates, call management)
    if (aiActions.length) {
      const statusSnapshot = await OfficerStatus.find({ guildId: guild.id }).lean().catch(() => []);
      await executeDispatchActions(aiActions, guild, config, statusSnapshot, userId);
      await rebuildStatusBoard(guild, config);
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
          // Ask via voice before moving - wait for a spoken yes or no
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
              const ttsText = `Copy ${ttsName}, showing you ten eleven. Would you like me to move you to the traffic stop channel?`;
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
      // Officer called 10-8 verbally - clear their stop status
      const wasOnStop = officerDbStatus?.tenCode === '10-11';
      const wasOnScene = officerDbStatus?.tenCode === '10-97';
      await updateOfficerStatus(guild.id, userId, officerName, '10-8', parsed, null);

      // If bot is currently in the stop channel with this officer, move back to patrol
      let handledStopReturn = false;
      try {
        const { getCurrentChannelId, clearExtendedStay } = await import('../utils/voiceListener.js');
        const currentBotChannelId = getCurrentChannelId(guild.id);
        const officerVoiceChannelId = member?.voice?.channelId;
        const isInStopWithOfficer = currentBotChannelId &&
          officerVoiceChannelId === currentBotChannelId &&
          !config.patrolChannelIds?.includes(currentBotChannelId);

        if (isInStopWithOfficer) {
          handledStopReturn = true;
          clearExtendedStay(guild.id);
        }
      } catch (err) {
        console.error('[Dispatch] 10-8 auto-return error:', err.message);
      }

      // Acknowledge 10-8 - deduped per officer (30s cooldown) and batched
      // across multiple officers announcing available within the same 2-second window.
      if (!dispatchResponse && config.aiEnabled && hasAIKey()) {
        const ackKey = `${guild.id}:${userId}:10-8`;
        const lastAck = recentStatusAcks.get(ackKey) || 0;
        if (Date.now() - lastAck < 30_000) {
          console.log(`[Dispatch] Suppressing duplicate 10-8 TTS for ${officerName} (within 30s cooldown)`);
        } else {
          recentStatusAcks.set(ackKey, Date.now());
          // Add to per-guild batch queue; flush after 2s so multiple officers are grouped
          const q = pending10_8Queues.get(guild.id) || { officers: [], timer: null };
          if (!q.officers.find(o => o.userId === userId)) {
            q.officers.push({ userId, name: officerName, wasOnStop, wasOnScene: wasOnScene || handledStopReturn });
          }
          if (!q.timer) {
            q.timer = setTimeout(() => flush10_8Queue(guild, config), 2000);
          }
          pending10_8Queues.set(guild.id, q);
        }
      }

    } else if (voiceAction === 'out_of_service') {
      await OfficerStatus.deleteOne({ guildId: guild.id, userId }).catch(() => {});
      // Brief 10-7 acknowledgment - only when officer addressed dispatch directly
      if (hadTrigger && !dispatchResponse && config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(`Ten-four ${ttsName}, showing you ten seven. Out of service.`);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch {}
      }
    } else if (parsed.code === '10-4') {
      // 10-4 is just a verbal "copy/acknowledged" - not a real duty status.
      // Don't overwrite the officer's actual status (10-8, 10-76, etc.) in the
      // DB/portal with it; only speak an acknowledgment when addressed directly.
      if (hadTrigger && !dispatchResponse && config.aiEnabled && hasAIKey()) {
        try {
          const { playDispatchVoice } = await import('../utils/voiceListener.js');
          const ttsBuffer = await generateDispatchTTS(`Copy ${ttsName}.`);
          playDispatchVoice(guild.id, ttsBuffer);
        } catch (err) {
          console.error('[Dispatch TTS] 10-4 ack error:', err.message);
        }
      }
    } else if (parsed.code) {
      const existing = await OfficerStatus.findOne({ guildId: guild.id, userId });
      await updateOfficerStatus(guild.id, userId, officerName, parsed.code, parsed, existing?.lastPatrolChannelId || null);

      // 10-99 - trigger full panic alert (embed + TTS + status board)
      // Guard: skip if a panic alert was already sent for this guild in the last 90 seconds
      // to prevent duplicate alerts when multiple officers say "officer down" about the same incident.
      if (parsed.code === '10-99') {
        const _lastPanic = _panicCooldowns.get(guild.id) || 0;
        if (Date.now() - _lastPanic < 90_000) {
          console.log(`[Dispatch] 10-99 suppressed - panic already active in ${guild.name} (cooldown ${Math.round((Date.now() - _lastPanic) / 1000)}s ago)`);
        } else {
          _panicCooldowns.set(guild.id, Date.now());
          await triggerPanicAlert(guild, config, userId, officerName, member?.voice?.channelId || null);
        }
      }

      // 10-80 - Pursuit: always broadcast to patrol and play alert sound
      else if (parsed.code === '10-80') {
        const { getCurrentChannelId, clearExtendedStay } = await import('../utils/voiceListener.js');
        const currentBotChannelId = getCurrentChannelId(guild.id);
        const officerVoiceChannelId = member?.voice?.channelId;
        const isInStopChannel = currentBotChannelId &&
          officerVoiceChannelId === currentBotChannelId &&
          !config.patrolChannelIds?.includes(currentBotChannelId);
        const pursuitChannelId = officerVoiceChannelId || currentBotChannelId;
        await triggerPursuitBroadcast(guild, config, userId, officerName, pursuitChannelId);
        if (isInStopChannel) clearExtendedStay(guild.id);
      }

      // Brief acknowledgment for common status codes - only when officer addressed dispatch
      // (trigger word, call sign, or emergency phrase). Without a trigger, status is updated
      // silently in DB only - the bot must NOT speak back to unaddressed radio chatter.
      else if (hadTrigger && !dispatchResponse && config.aiEnabled && hasAIKey()) {
        const SILENT_CODES = new Set(['10-4', '10-6']); // already handled by SIMPLE_ACK_CODES
        if (!SILENT_CODES.has(parsed.code)) {
          const STATUS_ACK_MAP = {
            '10-23': `Copy ${ttsName}, ten twenty-three, arrived at location.`,
            '10-76': `Copy ${ttsName}, ten seventy-six, en route.`,
            '10-97': `Copy ${ttsName}, ten ninety-seven, on scene.`,
            '10-11': `Copy ${ttsName}, ten eleven.`,
            '10-15': `Copy ${ttsName}, ten fifteen, prisoner in custody.`,
            '10-17': `Copy ${ttsName}, ten seventeen.`,
            '10-19': `Copy ${ttsName}, ten nineteen, returning to station.`,
            '10-50': `Copy ${ttsName}, ten fifty.`,
            '10-52': `Copy ${ttsName}, ten fifty-two, EMS en route.`,
            '10-78': `All units, ten seventy-eight. ${ttsName} needs assistance.`,
          };
          const ackText = STATUS_ACK_MAP[parsed.code];
          if (ackText) {
            try {
              const { playDispatchVoice } = await import('../utils/voiceListener.js');
              addToRadioLog(guild.id, cleanNameForTTS(officerName), transcript, ackText);
              const ttsBuffer = await generateDispatchTTS(ackText);
              playDispatchVoice(guild.id, ttsBuffer);
            } catch {}
          }
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

  statusEvents.emit('statusUpdate', { guildId, userId, tenCode });
}

// Per-user transcript dedup map { guildId:userId → { ts, text } }
const _transcriptDedup = new Map();

// Cross-user hallucination tracker { "guildId:normalizedPhrase" → { firstUserId, firstTs } }
// Used to suppress Whisper hallucinations that appear from multiple users in quick succession.
const _crossUserHallucinationTracker = new Map();

// Status category helpers for the board
const SCENE_CODES     = new Set(['10-11', '10-97', '10-50', '10-31', '10-52']);
const EN_ROUTE_CODES  = new Set(['10-76', '10-23']);
const TRANSPORT_CODES = new Set(['10-15', '10-17']);
const BUSY_CODES      = new Set(['10-6', '10-7', '10-19']);
const ALERT_CODES     = new Set(['10-99', '10-80', '10-78']);
const CODE_PREFIX = {
  '10-8':  '[AVL]',
  '10-11': '[STOP]',
  '10-76': '[EN ROUTE]',
  '10-17': '[TRANSPORTING]',
  '10-97': '[SCENE]',
  '10-80': '[PURSUIT]',
  '10-99': '[PANIC]',
  '10-78': '[BACKUP]',
  '10-6':  '[BUSY]',
  '10-7':  '[OOS]',
  '10-15': '[DETAINED]',
  '10-19': '[RTB]',
  '10-50': '[ACCIDENT]',
  '10-52': '[EMS REQ]',
  '10-31': '[CRIME]',
};

export async function rebuildStatusBoard(guild, config) {
  if (!config?.statusBoardChannelId) return;

  // Always re-fetch config from DB so we have the latest statusBoardMessageId,
  // even when a stale in-memory config object is passed in.
  const freshConfig = await DispatchConfig.findOne({ guildId: guild.id }).lean().catch(() => null);
  if (freshConfig) config = freshConfig;

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

  // ── Officer group filters ─────────────────────────────────────────────────
  const panicOfficers      = officers.filter(o => o.tenCode === '10-99');
  const pursuitOfficers    = officers.filter(o => o.tenCode === '10-80');
  const backupOfficers     = officers.filter(o => o.tenCode === '10-78');
  const enRouteOfficers    = officers.filter(o => EN_ROUTE_CODES.has(o.tenCode));
  const trafficStopOfficers = officers.filter(o => o.tenCode === '10-11');
  const onSceneOfficers    = officers.filter(o => o.tenCode === '10-97');
  const accidentOfficers   = officers.filter(o => o.tenCode === '10-50');
  const crimeOfficers      = officers.filter(o => o.tenCode === '10-31');
  const emsReqOfficers     = officers.filter(o => o.tenCode === '10-52');
  const detainedOfficers   = officers.filter(o => TRANSPORT_CODES.has(o.tenCode));
  const availOfficers      = officers.filter(o => o.tenCode === '10-8');
  const busyOfficers       = officers.filter(o => BUSY_CODES.has(o.tenCode));
  const otherOfficers      = officers.filter(o =>
    !ALERT_CODES.has(o.tenCode) && !SCENE_CODES.has(o.tenCode) &&
    !EN_ROUTE_CODES.has(o.tenCode) && o.tenCode !== '10-8' &&
    !BUSY_CODES.has(o.tenCode) && !TRANSPORT_CODES.has(o.tenCode) && o.tenCode !== '10-15'
  );

  const totalOnScene = trafficStopOfficers.length + onSceneOfficers.length +
    accidentOfficers.length + crimeOfficers.length + emsReqOfficers.length;

  const unresponded = activeCalls.filter(c => !c.respondingLeoId && (!c.attachedLeoIds || c.attachedLeoIds.length === 0));

  // ── Stats summary header ──────────────────────────────────────────────────
  const statLine = [
    `Avail: **${availOfficers.length}**`,
    `En Route: **${enRouteOfficers.length}**`,
    `On Scene: **${totalOnScene}**`,
    `Busy: **${busyOfficers.length}**`,
    `On Duty: **${officers.length}**`,
  ].join('  ·  ');

  const headerParts = [statLine];

  if (activeCalls.length > 0) {
    headerParts.push(
      unresponded.length > 0
        ? `**${activeCalls.length} Active Call${activeCalls.length !== 1 ? 's' : ''}** - **${unresponded.length} NEED${unresponded.length === 1 ? 'S' : ''} UNITS**`
        : `**${activeCalls.length} Active Call${activeCalls.length !== 1 ? 's' : ''}** on the board`
    );
  }

  if (priorityData?.priorityActive) {
    const since = priorityData.activatedAt
      ? `<t:${Math.floor(new Date(priorityData.activatedAt).getTime() / 1000)}:R>`
      : '';
    headerParts.push(`**PRIORITY ACTIVE** - ${priorityData.priorityIssuedBy || 'Unknown'}${since ? ` · activated ${since}` : ''}`);
  }

  if (priorityData?.cooldownEndsAt && new Date(priorityData.cooldownEndsAt) > new Date()) {
    const remaining = Math.ceil((new Date(priorityData.cooldownEndsAt) - Date.now()) / 60000);
    headerParts.push(`**Priority Cooldown:** ${remaining} min remaining - issued by ${priorityData.cooldownIssuedBy || 'Unknown'}`);
  }

  if (boloCount > 0) headerParts.push(`**${boloCount} Active BOLO${boloCount !== 1 ? 's' : ''}** on file`);

  // ── Officer row builder ───────────────────────────────────────────────────
  const buildRow = (o) => {
    const codeLabel = TEN_CODES[o.tenCode]?.label || o.tenCode;
    const prefix    = CODE_PREFIX[o.tenCode] || `[${o.tenCode}]`;
    const since     = `<t:${Math.floor(new Date(o.updatedAt).getTime() / 1000)}:R>`;

    // Time on current status (for urgency awareness)
    const statusMins = Math.floor((Date.now() - new Date(o.updatedAt).getTime()) / 60000);
    const durationStr = statusMins >= 60
      ? `${Math.floor(statusMins / 60)}h ${statusMins % 60}m`
      : statusMins > 0 ? `${statusMins}m` : 'just now';

    let line = `**${prefix}** <@${o.userId}> - **${codeLabel}**`;
    if (o.subject)              line += `\n   ╟ With: ${o.subject}`;
    if (o.location)             line += `\n   ╟ Location: ${o.location}`;
    if (o.trafficStopChannelId) line += `\n   ╟ Stop Channel: <#${o.trafficStopChannelId}>`;

    if ((SCENE_CODES.has(o.tenCode) || ALERT_CODES.has(o.tenCode) || EN_ROUTE_CODES.has(o.tenCode)) && o.trafficStopStartAt) {
      const mins = Math.floor((Date.now() - new Date(o.trafficStopStartAt).getTime()) / 60000);
      if (mins > 0) line += `\n   ╟ Time on status: **${mins} min**`;
    }

    line += `\n   ╙ Updated ${since} (**${durationStr}**)`;

    // Show which call this officer is on (with incident label)
    const attachedCall = activeCalls.find(c =>
      c.respondingLeoId === o.userId || c.attachedLeoIds?.includes(o.userId)
    );
    if (attachedCall) {
      const role    = attachedCall.respondingLeoId === o.userId ? 'PRIMARY' : 'ATTACHED';
      const num     = attachedCall.callId?.split('-').slice(-1)[0] || '???';
      const issue   = attachedCall.issue ? ` - ${attachedCall.issue.slice(0, 28)}` : '';
      line += `\n   ╟ Call #${num}${issue} [${role}]`;
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

  if (enRouteOfficers.length > 0)
    sections.push(`**━━ EN ROUTE - 10-76 (${enRouteOfficers.length}) ━━**\n` + enRouteOfficers.map(buildRow).join('\n\n'));

  if (crimeOfficers.length > 0)
    sections.push(`**━━ CRIME IN PROGRESS (${crimeOfficers.length}) ━━**\n` + crimeOfficers.map(buildRow).join('\n\n'));

  if (accidentOfficers.length > 0)
    sections.push(`**━━ ACCIDENT SCENE (${accidentOfficers.length}) ━━**\n` + accidentOfficers.map(buildRow).join('\n\n'));

  if (emsReqOfficers.length > 0)
    sections.push(`**━━ EMS REQUESTED (${emsReqOfficers.length}) ━━**\n` + emsReqOfficers.map(buildRow).join('\n\n'));

  if (trafficStopOfficers.length > 0)
    sections.push(`**━━ TRAFFIC STOP - 10-11 (${trafficStopOfficers.length}) ━━**\n` + trafficStopOfficers.map(buildRow).join('\n\n'));

  if (onSceneOfficers.length > 0)
    sections.push(`**━━ ON SCENE - 10-97 (${onSceneOfficers.length}) ━━**\n` + onSceneOfficers.map(buildRow).join('\n\n'));

  if (detainedOfficers.length > 0)
    sections.push(`**━━ PRISONER / DETAINED (${detainedOfficers.length}) ━━**\n` + detainedOfficers.map(buildRow).join('\n\n'));

  if (availOfficers.length > 0)
    sections.push(`**━━ AVAILABLE - 10-8 (${availOfficers.length}) ━━**\n` + availOfficers.map(buildRow).join('\n\n'));

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
      .setFooter({ text: 'RPM • CAD' })
      .setTimestamp();

    const callRows = activeCalls.map(c => {
      const since    = `<t:${Math.floor(new Date(c.timestamp).getTime() / 1000)}:R>`;
      const callNum  = c.callId?.split('-').slice(-1)[0] || '???';
      const ageMins  = Math.floor((Date.now() - new Date(c.timestamp).getTime()) / 60000);
      const noUnits  = !c.respondingLeoId && (!c.attachedLeoIds || c.attachedLeoIds.length === 0);
      const urgency  = ageMins >= 10 ? ' - [CRITICAL]' : ageMins >= 5 ? ' - [URGENT]' : '';
      const ageLabel = ageMins >= 60
        ? `${Math.floor(ageMins / 60)}h ${ageMins % 60}m`
        : ageMins > 0 ? `${ageMins}m` : 'new';

      let line = `**Call #${callNum}** · ${since} · **${ageLabel} old**${urgency}`;
      if (noUnits) line += ' · **NO UNITS**';
      if (c.issue)               line += `\n┣ Incident: ${c.issue}`;
      if (c.location)            line += `\n┣ Location: ${c.location}`;
      if (c.suspectsDescription) line += `\n┣ Suspects: ${c.suspectsDescription}`;
      if (c.reporterUsername)    line += `\n┣ Reported by: ${c.reporterUsername}`;

      // Units assigned to this call
      const allUnitIds = [c.respondingLeoId, ...(c.attachedLeoIds || [])].filter(Boolean);
      if (allUnitIds.length > 0) {
        const unitList = allUnitIds.map(id =>
          id === c.respondingLeoId ? `<@${id}> [PRIMARY]` : `<@${id}>`
        );
        line += `\n┣ Units: ${unitList.join(', ')}`;
      }

      // Officers currently en-route to this call
      const enRouteUnits = officers.filter(o =>
        EN_ROUTE_CODES.has(o.tenCode) &&
        activeCalls.some(ac => ac.callId === c.callId &&
          (ac.respondingLeoId === o.userId || ac.attachedLeoIds?.includes(o.userId)))
      );
      if (enRouteUnits.length > 0)
        line += `\n┣ En Route: ${enRouteUnits.map(o => `<@${o.userId}>`).join(', ')}`;

      line += noUnits ? `\n┗ Awaiting response` : `\n┗ Active`;
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
        let line = `**BOLO #${num}** - **${b.characterName}** · ${issued}`;
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

  // Row 1: Quick-status buttons - always present
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dispatch_quick_10_8')
        .setLabel('10-8 - Available')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('dispatch_quick_10_6')
        .setLabel('10-6 - Busy')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('dispatch_quick_10_76')
        .setLabel('10-76 - En Route')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('dispatch_quick_10_97')
        .setLabel('10-97 - On Scene')
        .setStyle(ButtonStyle.Primary),
    )
  );

  // Rows 2-4: Per-call Close buttons (2 calls per row, up to 6 calls shown)
  const callsForButtons = activeCalls.slice(0, 6);
  for (let i = 0; i < callsForButtons.length && components.length < 4; i += 2) {
    const rowBuilder = new ActionRowBuilder();
    const callA = callsForButtons[i];
    const numA  = callA.callId?.split('-').slice(-1)[0] || '???';
    rowBuilder.addComponents(
      new ButtonBuilder()
        .setCustomId(`dispatch_close_call_${callA._id}`)
        .setLabel(`Close Call #${numA}`)
        .setStyle(ButtonStyle.Danger),
    );
    const callB = callsForButtons[i + 1];
    if (callB) {
      const numB = callB.callId?.split('-').slice(-1)[0] || '???';
      rowBuilder.addComponents(
        new ButtonBuilder()
          .setCustomId(`dispatch_close_call_${callB._id}`)
          .setLabel(`Close Call #${numB}`)
          .setStyle(ButtonStyle.Danger),
      );
    }
    components.push(rowBuilder);
  }

  // Row 5: Per-officer clear buttons (up to 4 officers, fills the last available slot)
  if (components.length < 5 && officers.length > 0) {
    const clearButtons = officers.slice(0, 4).map(o =>
      new ButtonBuilder()
        .setCustomId(`dispatch_clear_status_${o.userId}`)
        .setLabel(`Clear ${o.username.slice(0, 18)}`)
        .setStyle(ButtonStyle.Secondary)
    );
    components.push(new ActionRowBuilder().addComponents(clearButtons));
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
      .setDescription(`<@${targetUserId}> is **10-8 - Available**. The traffic stop has been cleared.`)
      .setFooter({ text: 'RPM' })
      .setTimestamp();

    return interaction.update({ embeds: [clearEmbed], components: [] });
  } catch (err) {
    console.error('[Dispatch] Stop clear button error:', err.message);
    return interaction.reply({ embeds: [errorEmbed('An error occurred.')], flags: 64 }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 10-99 PANIC CLEAR - reverse a panic alert
// ────────────────────────────────────────────────────────────────────────────
async function clearPanicAlert(guild, config, userId, officerName) {
  try {
    const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
      await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

    if (dispatchCh?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor('#43b581')
        .setTitle('10-99 Cleared - Stand Down')
        .setDescription(
          `**Officer:** <@${userId}> (${cleanNameForTTS(officerName)})\n` +
          `The 10-99 emergency has been cleared.\n` +
          `Showing **10-8 Available**. All units stand down.`
        )
        .setFooter({ text: 'RPM • Dispatch' })
        .setTimestamp();
      await dispatchCh.send({ embeds: [embed] }).catch(() => {});
    }

    // Deactivate priority board if it was auto-activated by this 10-99
    try {
      const priority = await Priority.findOne({ guildId: guild.id });
      if (priority?.priorityActive && priority.priorityIssuedBy?.includes('Auto - 10-99')) {
        priority.priorityActive = false;
        priority.priorityIssuedBy = null;
        priority.activatedAt = null;
        await priority.save();

        const { buildPriorityEmbed } = await import('./priorityTrackerHandler.js');
        const prEmbed = await buildPriorityEmbed(priority);
        const prCh = guild.channels.cache.get(priority.channelId) ||
          await guild.channels.fetch(priority.channelId).catch(() => null);
        if (prCh?.isTextBased() && priority.messageId) {
          const prMsg = await prCh.messages.fetch(priority.messageId).catch(() => null);
          if (prMsg) await prMsg.edit({ embeds: [prEmbed] }).catch(() => {});
        }
        console.log(`[Dispatch] Priority board deactivated after 10-99 clear in ${guild.name}`);
      }
    } catch (e) {
      console.error('[Dispatch] Panic clear - priority reset error:', e.message);
    }

    console.log(`[Dispatch] 10-99 cleared by ${officerName} in ${guild.name}`);
  } catch (err) {
    console.error('[Dispatch] clearPanicAlert error:', err.message);
  }
}

// 10-99 PANIC ALERT
// ────────────────────────────────────────────────────────────────────────────
export async function triggerPanicAlert(guild, config, userId, officerName, voiceChannelId) {
  try {
    const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
      await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
    if (!dispatchCh?.isTextBased()) return;

    const locationText = voiceChannelId ? `<#${voiceChannelId}>` : 'Unknown location';

    const panicEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('10-99 - OFFICER NEEDS ASSISTANCE')
      .setDescription(
        `**ALL UNITS - RESPOND IMMEDIATELY**\n\n` +
        `**Officer:** <@${userId}> (${cleanNameForTTS(officerName)})\n` +
        `**Last Known Location:** ${locationText}\n\n` +
        `**10-99 - All available officers need to respond to this officer's location immediately.**`
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

    // Play panic alert sound urgently (cuts through any queued audio)
    try {
      const { playDispatchVoice } = await import('../utils/voiceListener.js');
      if (PANIC_SOUND_BUFFER) {
        playDispatchVoice(guild.id, PANIC_SOUND_BUFFER, { urgent: true });
        console.log(`[Dispatch] Panic sound playing for ${guild.name}`);
      }

      // Queue the TTS broadcast immediately after the sound
      if (config.aiEnabled && hasAIKey()) {
        const ttsText = `Ten ninety nine, ten ninety nine. All units, officer ${cleanNameForTTS(officerName)} needs immediate assistance. All available units respond immediately. This is a ten ninety nine emergency.`;
        generateDispatchTTS(ttsText).then(ttsBuffer => {
          playDispatchVoice(guild.id, ttsBuffer);
        }).catch(err => console.error('[Dispatch TTS] Panic alert TTS error:', err.message));
      }
    } catch (err) {
      console.error('[Dispatch] Panic alert audio error:', err.message);
    }

    console.log(`[Dispatch] 10-99 PANIC ALERT triggered for ${officerName} in ${guild.name}`);

    // ── Auto-activate priority board ──────────────────────────────────────
    try {
      const priority = await Priority.findOne({ guildId: guild.id });
      if (priority?.channelId) {
        const wasAlreadyActive = priority.priorityActive;
        priority.priorityActive = true;
        priority.priorityIssuedBy = `${officerName} (Auto - 10-99)`;
        priority.activatedAt = new Date();
        // Auto-activated (10-99) priority has no fixed expiry - clear any stale
        // expiresAt from a prior auto-expiring priority request.
        priority.expiresAt = null;
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
            if (pr && pr.priorityIssuedBy?.includes('Auto - 10-99')) {
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
      .setTitle('10-99 - OFFICER NEEDS ASSISTANCE')
      .setDescription(
        (interaction.message.embeds[0]?.description || '') +
        `\n\n**<@${interaction.user.id}> (${responderName}) is en route.**`
      )
      .setFooter({ text: 'RPM • PANIC ALERT' })
      .setTimestamp();

    const disabledBtn = new ButtonBuilder()
      .setCustomId(`dispatch_panic_ack_${targetUserId}`)
      .setLabel(`${responderName} - En Route`)
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

// Per-officer TTS dedup: Map<"guildId:userId:code", timestamp>
const recentStatusAcks = new Map();

// Per-guild 10-8 batch queue: officers who went 10-8 within the same 2-second window
// are announced together in one TTS instead of back-to-back individual announcements.
const pending10_8Queues = new Map();

/**
 * Per-guild "status roll call" mode.
 * Set when dispatch broadcasts "all units update your status".
 * While active, any officer can say bare "10-8", "ten eight", "available",
 * "10-6", "ten six", "busy" WITHOUT the trigger word "dispatch" and their
 * status will be updated + acknowledged normally.
 * Value is the expiry timestamp (Date.now() + 3 minutes).
 */
const statusRollCallMode = new Map();
const ROLL_CALL_DURATION_MS = 3 * 60 * 1000; // 3 minutes

/** Regex that matches bare status-update phrases after normalizeSpokenCodes() */
const ROLL_CALL_STATUS_RE = /\b10[-\s]8\b|\bten.?eight\b|\bavailable\b|\bin.?service\b|\bback\s+(?:in\s+service|on\s+patrol|available)\b|\b10[-\s]6\b|\bten.?six\b|\bbusy\b/i;

async function flush10_8Queue(guild, config) {
  const q = pending10_8Queues.get(guild.id);
  pending10_8Queues.delete(guild.id);
  if (!q?.officers?.length) return;

  try {
    const { playDispatchVoice } = await import('../utils/voiceListener.js');
    const officers = q.officers;
    let ackText;

    if (officers.length === 1) {
      const o = officers[0];
      const n = cleanNameForTTS(o.name);
      if (o.wasOnStop) ackText = `Ten-four ${n}, showing you ten eight. Stop is clear.`;
      else if (o.wasOnScene) ackText = `Copy ${n}, ten eight. You're clear.`;
      else ackText = `Ten-four ${n}, showing you ten eight.`;
    } else {
      const names = officers.map(o => cleanNameForTTS(o.name));
      const nameList = names.length === 2
        ? names.join(' and ')
        : names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
      ackText = `Showing ${nameList} ten eight. All units available.`;
    }

    const ttsBuffer = await generateDispatchTTS(ackText);
    playDispatchVoice(guild.id, ttsBuffer);
  } catch (err) {
    console.error('[Dispatch] flush10_8Queue error:', err.message);
  }
}

async function triggerPursuitBroadcast(guild, config, officerId, officerName, pursuitChannelId) {
  try {
    // Dedup - skip if same officer already has an active pursuit within the last 2 minutes
    const existingAlert = activePursuitAlerts.get(guild.id);
    if (existingAlert && existingAlert.officerId === officerId && Date.now() - existingAlert.timestamp < 2 * 60 * 1000) {
      console.log(`[Dispatch] 10-80 duplicate suppressed for ${officerName} (already active)`);
      return;
    }

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
    try {
      const { playDispatchVoice } = await import('../utils/voiceListener.js');

      if (config.aiEnabled && hasAIKey()) {
        const ttsText = `All units, ten eighty. ${cleanNameForTTS(officerName)} is in pursuit. Available units, say responding to back up.`;
        generateDispatchTTS(ttsText).then(ttsBuffer => {
          playDispatchVoice(guild.id, ttsBuffer, { urgent: true });
        }).catch(err => console.error('[Dispatch TTS] Pursuit broadcast TTS error:', err.message));
      }
    } catch (err) {
      console.error('[Dispatch] Pursuit broadcast audio error:', err.message);
    }

    // ── Post embed in dispatch channel with Respond button ───────────────
    if (config.dispatchChannelId) {
      const dispatchCh = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);
      if (dispatchCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('10-80 - Active Pursuit')
          .setDescription(
            `**Officer:** <@${officerId}> (${cleanNameForTTS(officerName)})\n` +
            `**Status:** Active pursuit in progress\n` +
            `**Pursuit Channel:** <#${pursuitChannelId}>\n\n` +
            `Officer ${cleanNameForTTS(officerName)} has initiated a **10-80 pursuit**. Any available unit, please respond.\n` +
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
        `\n\n**<@${interaction.user.id}> (${responderName}) is responding - moved to pursuit channel.**`
      );

    const disabledBtn = new ButtonBuilder()
      .setCustomId(`dispatch_pursuit_respond_${guildId}`)
      .setLabel(`${responderName} - Responding`)
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
const trafficStopCheckinSent = new Map(); // key: guildId:userId - tracks last checkin msg time
const trafficStopVisitInProgress = new Set(); // guildIds currently mid-visit (bot is in a stop channel)

async function checkTrafficStops(guild) {
  try {
    const config = await DispatchConfig.findOne({ guildId: guild.id });
    if (!config?.enabled) return;

    const onStopOfficers = await OfficerStatus.find({ guildId: guild.id, tenCode: '10-11' });
    if (onStopOfficers.length === 0) return;

    // ── Busy guard: skip entirely if dispatch is already visiting a stop channel ──
    if (trafficStopVisitInProgress.has(guild.id)) {
      console.log(`[Dispatch] Skipping traffic stop check - visit already in progress for ${guild.name}`);
      return;
    }

    // ── Busy guard: skip if dispatch is currently talking in the patrol channel ──
    const { getDispatchState, getExtendedStay } = await import('../utils/voiceListener.js');
    const dispState = getDispatchState(guild.id);
    if (dispState?.audioPlaying) {
      console.log(`[Dispatch] Skipping traffic stop check - dispatch currently talking in ${guild.name}`);
      return;
    }

    for (const officer of onStopOfficers) {
      const key = `${guild.id}:${officer.userId}`;
      const lastCheck = trafficStopCheckinSent.get(key) || 0;

      // Only check in once per minute per officer
      if (Date.now() - lastCheck < 58 * 1000) continue;

      // Skip check-in if dispatch has an active extended stay for this guild
      const stay = getExtendedStay(guild.id);
      if (stay) {
        console.log(`[Dispatch] Skipping traffic stop check-in for ${officer.username} - extended stay active`);
        continue;
      }

      // Find the officer's current voice channel
      const member = await guild.members.fetch(officer.userId).catch(() => null);
      const voiceChannelId = member?.voice?.channelId || officer.trafficStopChannelId;
      if (!voiceChannelId) continue;

      const targetChannel = guild.channels.cache.get(voiceChannelId) ||
        await guild.channels.fetch(voiceChannelId).catch(() => null);
      if (!targetChannel) continue;

      // Don't enter if the channel is empty (officer already left)
      const membersInChannel = targetChannel.members?.filter(m => !m.user.bot).size ?? 0;
      if (membersInChannel === 0) continue;

      trafficStopCheckinSent.set(key, Date.now());

      const minutesIn = officer.trafficStopStartAt
        ? Math.floor((Date.now() - new Date(officer.trafficStopStartAt).getTime()) / 60000)
        : null;

      console.log(`[Dispatch] Delivering traffic stop check-in TTS for ${officer.username} in channel "${targetChannel.name}"`);

      // Speak the check-in into the traffic stop voice channel, then return to patrol
      if (config.aiEnabled && hasAIKey()) {
        trafficStopVisitInProgress.add(guild.id);
        try {
          const { playTTSInChannelAndReturn } = await import('../utils/voiceListener.js');
          const subjectPart = officer.subject ? ` with ${officer.subject}` : '';
          const minutesPart = minutesIn !== null && minutesIn > 0
            ? ` You have been on this stop for ${minutesIn} minute${minutesIn !== 1 ? 's' : ''}.`
            : '';
          const ttsText = `${cleanNameForTTS(officer.username)}, dispatch${subjectPart}.${minutesPart} Still showing you ten eleven. Ten four?`;
          const ttsBuffer = await generateDispatchTTS(ttsText);
          await playTTSInChannelAndReturn(targetChannel, ttsBuffer);
        } catch (err) {
          console.error('[Dispatch TTS] Traffic stop check-in TTS error:', err.message);
        } finally {
          trafficStopVisitInProgress.delete(guild.id);
        }
      }


      // Only visit one officer per cycle to avoid overlapping channel visits
      break;
    }

    // Clean up stale keys for officers no longer on stop
    for (const [key] of trafficStopCheckinSent) {
      const [gId, uId] = key.split(':');
      if (gId !== guild.id) continue;
      if (!onStopOfficers.some(o => o.userId === uId)) trafficStopCheckinSent.delete(key);
    }
  } catch (err) {
    console.error('[Dispatch] checkTrafficStops error:', err.message);
    trafficStopVisitInProgress.delete(guild.id); // ensure flag is always cleared on error
  }
}

const TRAFFIC_STOP_CHECK_MS = 60 * 1000; // check every 1 minute

export function startTrafficStopCheckTimer(guild) {
  if (trafficStopCheckIntervals.has(guild.id)) return;
  const interval = setInterval(() => checkTrafficStops(guild), TRAFFIC_STOP_CHECK_MS);
  trafficStopCheckIntervals.set(guild.id, interval);
  console.log(`[Dispatch] Traffic stop check timer started for ${guild.name} (60s interval)`);
}

export function stopTrafficStopCheckTimer(guildId) {
  const interval = trafficStopCheckIntervals.get(guildId);
  if (interval) {
    clearInterval(interval);
    trafficStopCheckIntervals.delete(guildId);
  }
}

export async function handleStopStillButton(interaction) {
  try {
    const targetUserId = interaction.customId.replace('dispatch_stop_still_', '');
    const isSelf = interaction.user.id === targetUserId;

    const embed = new EmbedBuilder()
      .setColor('#FF8C00')
      .setTitle('Traffic Stop - Still Active')
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

    console.log(`[Dispatch] Status reminder - no status: ${needsReminder.length}, still on scene: ${stillOnScene.length} in ${guild.name}`);

    if (config.aiEnabled && hasAIKey()) {
      try {
        const { playDispatchVoice } = await import('../utils/voiceListener.js');

        const parts = [];

        if (needsReminder.length > 0) {
          const nameList = needsReminder.length === 1
            ? needsReminder[0]
            : needsReminder.slice(0, -1).join(', ') + ' and ' + needsReminder.at(-1);
          parts.push(`Attention all units, ${nameList}, please update your current status. If you are available, say ten eight. If you are busy, say ten six.`);
        }

        if (stillOnScene.length > 0) {
          for (const officer of stillOnScene) {
            const subjectPart = officer.subject ? ` with ${officer.subject}` : '';
            parts.push(`${officer.name}, dispatch showing you still on scene${subjectPart}. Please confirm or say ten eight if you are clear.`);
          }
        }

        const ttsText = parts.join(' ');

        // Activate roll call mode for 3 minutes so officers can respond with
        // bare "10-8" or "ten eight" without needing the "dispatch" trigger word.
        statusRollCallMode.set(guild.id, Date.now() + ROLL_CALL_DURATION_MS);
        console.log(`[Dispatch] Roll call mode activated for ${guild.name} (3 min)`);

        // Fire TTS in background - don't await so the timer callback returns fast
        generateDispatchTTS(ttsText)
          .then(buf => playDispatchVoice(guild.id, buf))
          .catch(err => console.error('[Dispatch TTS] Status reminder TTS error:', err.message));

      } catch (err) {
        console.error('[Dispatch TTS] Status reminder TTS error:', err.message);
      }
    }
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

export function stopStatusReminderTimer(guildId) {
  const interval = statusReminderIntervals.get(guildId);
  if (interval) {
    clearInterval(interval);
    statusReminderIntervals.delete(guildId);
  }
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
          const ttsText = 'Attention all units, dispatch is performing an hourly status reset. All officer statuses have been cleared. All units please update your current status. Say ten eight if available, ten six if busy, or your current code if on scene.';

          // Open roll call mode for 3 minutes so officers can reply with bare "10-8"
          statusRollCallMode.set(guild.id, Date.now() + ROLL_CALL_DURATION_MS);
          console.log(`[Dispatch] Roll call mode activated for ${guild.name} (3 min, hourly reset)`);

          // Fire TTS in background - don't block the reset on TTS generation
          generateDispatchTTS(ttsText)
            .then(buf => playDispatchVoice(guild.id, buf))
            .catch(err => console.error('[Dispatch TTS] Hourly reset TTS error:', err.message));
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
    const codeMap = {
      'dispatch_quick_10_8':  '10-8',
      'dispatch_quick_10_6':  '10-6',
      'dispatch_quick_10_76': '10-76',
      'dispatch_quick_10_97': '10-97',
    };
    const code = codeMap[interaction.customId] || '10-8';
    const officerName = interaction.member.displayName || interaction.user.username;
    const guildId = interaction.guildId;

    await updateOfficerStatus(guildId, interaction.user.id, officerName, code,
      { code, codeInfo: TEN_CODES[code], subject: null, location: null, rawText: `Quick status: ${code}` },
      null
    );

    const config = await DispatchConfig.findOne({ guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const codeLabel = TEN_CODES[code]?.label || code;
    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setDescription(`<@${interaction.user.id}> is now showing **${codeLabel}**. Status board updated.`)
      .setFooter({ text: 'RPM • Dispatch' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    console.error('[Dispatch] Quick status button error:', err.message);
    interaction.reply({ content: 'An error occurred.', flags: 64 }).catch(() => {});
  }
}

export async function handleCloseCallButton(interaction) {
  try {
    const guildId  = interaction.guildId;
    const callId   = interaction.customId.replace('dispatch_close_call_', '');

    const call = await EmergencyCall.findOne({ _id: callId, guildId });
    if (!call || call.status === 'closed') {
      return interaction.reply({ content: 'That call is already closed or does not exist.', flags: 64 });
    }

    const callNum = call.callId?.split('-').slice(-1)[0] || '???';
    call.status = 'closed';
    await call.save();

    const config = await DispatchConfig.findOne({ guildId });
    await rebuildStatusBoard(interaction.guild, config);

    const embed = new EmbedBuilder()
      .setColor('#2d2d2d')
      .setDescription(`**Call #${callNum}** closed by <@${interaction.user.id}>. Status board updated.`)
      .setFooter({ text: 'RPM • Dispatch' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: 64 });
  } catch (err) {
    console.error('[Dispatch] Close call button error:', err.message);
    interaction.reply({ content: 'An error occurred closing that call.', flags: 64 }).catch(() => {});
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CALL REPEAT TIMER (existing, unchanged below)
// ────────────────────────────────────────────────────────────────────────────
const lastReminderAt = new Map();
const reminderCounts = new Map();
const REPEAT_DELAY_MS = 2 * 60 * 1000;
const REMINDER_INTERVAL_MS = 2 * 60 * 1000;
// Only repeat an unanswered 911 call reminder twice, then go silent on it
// until someone responds - officers found endless reminders annoying.
const MAX_REMINDERS = 2;
const repeatIntervals = new Map();
// Guards against back-to-back reminder TTS overlapping/stacking when several
// calls become due for a reminder in the same check cycle - all calls that
// are due get folded into ONE combined voice announcement instead of one
// TTS clip per call, and that combined clip is itself rate-limited per guild.
const lastGlobalReminderTTSAt = new Map();
const GLOBAL_REMINDER_TTS_COOLDOWN_MS = 60 * 1000;

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

    const dueCalls = [];

    for (const call of unrespondedCalls) {
      const priorCount = reminderCounts.get(call.callId) || 0;
      if (priorCount >= MAX_REMINDERS) continue;

      const lastReminder = lastReminderAt.get(call.callId) || 0;
      if (Date.now() - lastReminder < REMINDER_INTERVAL_MS) continue;
      lastReminderAt.set(call.callId, Date.now());
      reminderCounts.set(call.callId, priorCount + 1);
      dueCalls.push({ call, reminderNum: priorCount + 1 });
    }

    if (dueCalls.length) {
      const dispatchChannel = guild.channels.cache.get(config.dispatchChannelId) ||
        await guild.channels.fetch(config.dispatchChannelId).catch(() => null);

      for (const { call, reminderNum } of dueCalls) {
        const callNum = call.callId?.split('-').pop() || 'unknown';
        console.log(`[Dispatch] Repeating unresponded 911 call #${callNum} for ${guild.name} (reminder ${reminderNum}/${MAX_REMINDERS})`);

        if (dispatchChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor('#2d2d2d')
            .setTitle('911 Call Reminder - No Units Responding')
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
      }

      if (config.aiEnabled && hasAIKey()) {
        const lastGlobalTTS = lastGlobalReminderTTSAt.get(guild.id) || 0;
        if (Date.now() - lastGlobalTTS < GLOBAL_REMINDER_TTS_COOLDOWN_MS) {
          console.log(`[Dispatch] Skipping reminder TTS for ${guild.name} - global cooldown active (another reminder just played)`);
        } else {
          try {
            const { playDispatchVoice, getDispatchState } = await import('../utils/voiceListener.js');
            const state = getDispatchState?.(guild.id);
            if (state?.connection) {
              let ttsText;
              if (dueCalls.length === 1) {
                const { call } = dueCalls[0];
                ttsText = `Attention all units, reminder, we still have an active nine one one call with no responding units. `;
                if (call.issue) ttsText += `${call.issue}. `;
                if (call.location) ttsText += `Location: ${call.location}. `;
                ttsText += `Any available unit, please respond.`;
              } else {
                ttsText = `Attention all units, reminder, we have ${dueCalls.length} active nine one one calls with no responding units. Any available units, please respond.`;
              }
              lastGlobalReminderTTSAt.set(guild.id, Date.now());
              const ttsBuffer = await generateDispatchTTS(ttsText);
              playDispatchVoice(guild.id, ttsBuffer);
            }
          } catch (err) {
            console.error(`[Dispatch] Failed to play combined 911 reminder TTS for ${guild.name}:`, err.message);
          }
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
      console.log(`[Dispatch] Skipping AI dispatch for ${guild.name} - not premium`);
      return;
    }

    const { setupDispatchForGuild, moveToChannel } = await import('../utils/voiceListener.js');
    const cadConfig = await CADConfig.findOne({ guildId: guild.id });
    const leoRoleIds = config.leoRoleIds?.length > 0 ? config.leoRoleIds : (cadConfig?.leoRoleIds ?? []);

    const options = {
      onTranscription: (wavBuffer, userId, _g, opts) => processVoiceCall(wavBuffer, userId, guild, client, opts),
      userFilter: async () => true,
    };

    let joinAudioBuffer = null;
    try {
      joinAudioBuffer = await generateDispatchTTS('Dispatch active. To talk to me, your sentence must begin with dispatch.');
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
    /* Periodic "please update your status" / hourly status reset TTS prompts were
       disabled per staff feedback - they were interrupting patrol too often. */
    const { start911Poller } = await import('../utils/voiceListener.js');
    start911Poller(guild.id);
  } catch (err) {
    console.error(`[Dispatch] initDispatchForGuild error for ${guild.name}:`, err.message);
  }
}

// ── Portal 911 call announcement ─────────────────────────────────────────────
export async function announce911Call(guild, call, dispatchCfg) {
  try {
    const channelId = dispatchCfg?.dispatchChannelId;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId) ||
      await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    const cadConfig = await CADConfig.findOne({ guildId: guild.id });
    const mentions = [];
    if (cadConfig?.leoRoleIds?.length) mentions.push(...cadConfig.leoRoleIds.map(id => `<@&${id}>`));
    if (cadConfig?.fireDepartmentRoleIds?.length) mentions.push(...cadConfig.fireDepartmentRoleIds.map(id => `<@&${id}>`));
    const content = mentions.length > 0 ? mentions.join(' ') : '@here';

    const embed = new EmbedBuilder()
      .setColor('#f04747')
      .setTitle('911 Emergency Call')
      .setDescription([
        `**Call ID:** \`${call.callId}\``,
        `**Caller:** ${call.reporterUsername || 'Unknown'}`,
        `**Emergency:** ${call.issue}`,
        `**Location:** ${call.location}`,
        call.suspectsDescription ? `**Suspect/Vehicle:** ${call.suspectsDescription}` : null,
        call.lastSeen ? `**Last Seen:** ${call.lastSeen}` : null,
        call.contact ? `**Contact:** ${call.contact}` : null,
      ].filter(Boolean).join('\n'))
      .setTimestamp()
      .setFooter({ text: 'RPM • 911 Dispatch' });

    const respondBtn = new ButtonBuilder()
      .setCustomId(`911_respond_${call.callId}`)
      .setLabel('Respond 10-76')
      .setStyle(ButtonStyle.Danger);
    const attachBtn = new ButtonBuilder()
      .setCustomId(`911_attach_${call.callId}`)
      .setLabel('Attach 10-97')
      .setStyle(ButtonStyle.Primary);
    const dismissBtn = new ButtonBuilder()
      .setCustomId(`911_dismiss_${call.callId}`)
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary);

    const sentMessage = await channel.send({
      content,
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(respondBtn, attachBtn, dismissBtn)],
    });

    await EmergencyCall.findOneAndUpdate(
      { _id: call._id },
      { messageId: sentMessage.id, channelId }
    );

    // Voice TTS announcement is handled exclusively by the 911 poller
    // (src/utils/voiceListener.js start911Poller/_run911Poll), which polls
    // for calls with dispatchAnnounced: false. Doing it here too caused
    // double announcements (race with the poller) and, since this path
    // didn't wait for the voice connection to be Ready, could silently
    // drop the audio if the bot's connection wasn't already live at the
    // exact moment the call came in.

    await rebuildStatusBoard(guild, dispatchCfg);
  } catch (err) {
    console.error('[Dispatch] announce911Call error:', err.message);
  }
}
