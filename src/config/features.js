/**
 * The canonical feature registry - one definition of what a feature IS.
 *
 * Before this file the feature list was written down in seven places that had
 * drifted apart: the menu in src/commands/setup.js, the subcommands in
 * src/commands/config.js, the buttons in enableCommandsHandler, three separate
 * arrays inside site/js/dashboard.js, and the cards in site/index.html. The
 * default-premium list existed in five copies, two of them wrong. Five features
 * existed in the dashboard but appeared in /setup nowhere at all.
 *
 * Everything that needs to know about features reads this instead. The web side
 * cannot import Node ESM, so it gets the same data over GET /api/public/features.
 *
 * FIELDS
 *   key         premium feature key - the string passed to checkFeatureAccess
 *   mod         dashboard / API slug used in /api/guild/:id/settings/:mod.
 *               NOT always equal to key: strike/strikes, ticket/tickets,
 *               antipromote/antipromo. Keeping both is what stops api.js from
 *               crossing the two namespaces.
 *   configKey   key this feature's on/off state arrives under in GET /guild/:id,
 *               e.g. verifyEnabled. Empty when the feature has no toggle.
 *   label       the one human name, used everywhere
 *   group       section heading for /setup and the dashboard sidebar
 *   short       one line for menus and sidebars
 *   long        what it does for a server, shown before enabling it
 *   modelFile   config model relative to src/ (featureStatus.js imports "../" + this)
 *   modelImport "default", or the named export
 *   enabledPath dot-path of the per-guild on/off flag, empty string if none
 *   required    fields that must be non-empty for the feature to actually work.
 *               Only fields where "unset" is expressible - a Boolean can never
 *               read as missing, so sub-toggles do not belong here.
 *   premiumDefault premium when no FeatureFlag row exists. Mirrors the fallback
 *               in src/utils/premiumCheck.js, which stays authoritative.
 *   botGated    whether any Discord command actually calls checkFeatureAccess
 *               with this key. economy and civjobs are gated on the web only.
 */

export const FEATURES = [
  // ------------------------------------------------------------------------
  // Foundation
  // ------------------------------------------------------------------------
  {
    key: "general",
    mod: "general",
    configKey: "",
    label: "General Settings",
    group: "Foundation",
    order: 10,
    short: "Core setup: the log channel every feature writes to",
    long:
      "The foundation every other feature builds on. Pick one staff-only channel and the bot records verifications, strikes, tickets, applications and bans there, giving your moderators a single audit trail they can actually review.",
    modelFile: "models/Config.js",
    modelImport: "default",
    enabledPath: "",
    required: ["logChannelId"],
    configSubcommand: "general",
    premiumDefault: false,
    botGated: false,
  },
  {
    key: "staff",
    mod: "staff",
    configKey: "",
    label: "Staff Management",
    group: "Foundation",
    order: 20,
    short: "Who can run bot commands. Add yourself and your admins",
    long:
      "Grant trusted members and roles access to bot commands without handing out Administrator. Add users or whole roles, and every config, moderation, and economy command opens up to them instantly.",
    modelFile: "models/Staff.js",
    modelImport: "default",
    enabledPath: "",
    required: [],
    configSubcommand: "",
    premiumDefault: false,
    botGated: false,
  },

  // ------------------------------------------------------------------------
  // Moderation
  // ------------------------------------------------------------------------
  {
    key: "verification",
    mod: "verification",
    configKey: "verifyEnabled",
    label: "Verification",
    group: "Moderation",
    order: 30,
    short: "Members fill out a form to join your server",
    long:
      "Gates your server behind a customizable intake form: PSN/Xbox tag, your own custom questions, optional staff approval. It then automatically grants the verified role and removes the unverified one so approved members get channel access instantly.",
    modelFile: "models/Verification.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["verifyChannelId", "verifiedRoleId"],
    configSubcommand: "verify",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "strike",
    mod: "strikes",
    configKey: "strikeEnabled",
    label: "Strike System",
    group: "Moderation",
    order: 40,
    short: "Multi-level strikes with auto timeout, kick, or ban",
    long:
      "Lets staff issue escalating strikes to rule-breakers, with an optional role and an automatic timeout, kick, or ban at each of the four levels. Every strike DMs the member and lands in your log channel.",
    modelFile: "models/Strike.js",
    modelImport: "StrikeConfig",
    enabledPath: "enabled",
    required: [],
    configSubcommand: "strikes",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "antipromote",
    mod: "antipromo",
    configKey: "antiPromotingEnabled",
    label: "Anti-Promoting",
    group: "Moderation",
    order: 50,
    short: "Auto-deletes Discord invite links from other servers",
    long:
      "Automatically deletes Discord invite links the moment members post them, DMs the offender an explanation, and logs every removal to your staff channel. Whitelist your own invites and let administrators post freely.",
    modelFile: "models/Config.js",
    modelImport: "default",
    enabledPath: "antiPromotingEnabled",
    // Off until somebody turns it on, and the screen used to claim it needed no
    // setup at all. Listing the flag here makes /setup say so rather than
    // showing a bare OFF with no way to tell what is wrong.
    required: ["antiPromotingEnabled"],
    configSubcommand: "antipromo",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "blacklist",
    mod: "blacklist",
    configKey: "blacklistEnabled",
    label: "Blacklist System",
    group: "Moderation",
    order: 60,
    short: "Blocks banned members at the verification wall",
    long:
      "Keeps banned members out for good. Blocked gamertags and IPs are checked at the verification wall with fuzzy matching that catches near-miss aliases, and a live panel in Discord stays current as staff add or clear entries.",
    modelFile: "models/BlacklistConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: [],
    configSubcommand: "blacklist",
    // Premium, but servers already running it keep it. Taking a working
    // moderation feature away from somebody mid use means banned members walk
    // back in, and they would rightly remove the bot rather than pay for it.
    // See grandfatheredBlacklist in premiumCheck.js.
    premiumDefault: true,
    freeTier: "servers already using it keep it",
    botGated: true,
  },

  // ------------------------------------------------------------------------
  // Roleplay
  // ------------------------------------------------------------------------
  {
    key: "roleplay",
    mod: "roleplay",
    configKey: "roleplayEnabled",
    label: "Roleplay Commands",
    group: "Roleplay",
    order: 70,
    short: "911 calls, CAD database, Twitter and anonymous posts",
    long:
      "Gives members a full CAD: civilians register characters, vehicles and firearms, file 911 calls, and post in-character Twitter or anonymous messages, while LEO and Fire roles respond, run plate checks, issue tickets and post BOLOs.",
    modelFile: "models/RoleplayCommands.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["use911Channel"],
    configSubcommand: "roleplay",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "dispatch",
    mod: "dispatch",
    configKey: "dispatchEnabled",
    label: "AI Voice Dispatch",
    group: "Roleplay",
    order: 80,
    short: "Bot joins patrol voice channels and acts as an AI dispatcher",
    long:
      "Officers speak in patrol voice channels and the bot transcribes them, replies in a realistic dispatcher voice, handles 10-codes and 911 calls, and keeps a live officer status board updated automatically.",
    modelFile: "models/DispatchConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["patrolChannelIds", "dispatchChannelId"],
    configSubcommand: "dispatch",
    premiumDefault: true,
    // Free servers get 911 calls read out in their patrol channel. The AI
    // dispatcher, the status board and 10-code handling stay premium.
    freeTier: "911 calls announced in your patrol voice channel",
    botGated: true,
  },
  {
    key: "priority",
    mod: "priority",
    configKey: "priorityEnabled",
    label: "Priority Tracker",
    group: "Roleplay",
    order: 90,
    short: "Live board showing when a priority event is active",
    long:
      "Posts a live-updating board in your priority channel so members always know whether a priority event is active. Staff start and stop scenes, set cooldown timers, and approve member priority requests directly from Discord.",
    modelFile: "models/Priority.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["channelId", "messageId"],
    configSubcommand: "priority",
    premiumDefault: true,
    botGated: true,
  },
  {
    key: "dutytime",
    mod: "dutytime",
    configKey: "dutyEnabled",
    label: "Patrol Hours",
    group: "Roleplay",
    order: 95,
    short: "Counts time officers spend in patrol voice channels",
    long:
      "Counts how long each officer actually spends on patrol, from the time they sit in a patrol voice channel with somebody else. Members check their own hours with /duty and compete on a leaderboard, and staff get a weekly board plus a list of who has stopped turning up. Deafened time and sitting alone do not count, so the number holds up in an argument.",
    modelFile: "models/DutyConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["boardChannelId"],
    configSubcommand: "dutytime",
    // Premium, but recording runs for everybody. A board that only starts
    // filling up once you subscribe shows a trial user a blank screen for the
    // whole week they are deciding in, which is the worst possible moment to
    // have nothing to show. Free servers accrue history and get /duty and a
    // top ten; paying opens the depth.
    premiumDefault: true,
    freeTier: "your own hours and a top ten over 7 days",
    botGated: true,
  },
  {
    key: "calendar",
    mod: "calendar",
    configKey: "calendarEnabled",
    label: "RP Calendar",
    group: "Roleplay",
    order: 100,
    short: "Weekly roleplay session schedule, posted and auto-updated",
    long:
      "Posts a live weekly schedule of your roleplay sessions in one channel. Staff add events with /setrp, times convert to each member's local timezone, and the calendar embed updates itself automatically.",
    modelFile: "models/RoleplayCalendar.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["channelId"],
    configSubcommand: "calendar",
    premiumDefault: false,
    botGated: true,
  },

  // ------------------------------------------------------------------------
  // Community
  // ------------------------------------------------------------------------
  {
    key: "ticket",
    mod: "tickets",
    configKey: "ticketEnabled",
    label: "Ticket Support",
    group: "Community",
    order: 110,
    short: "Members open private support channels with a button",
    long:
      "Members click a button to open a private support channel with staff. Create custom ticket types with role-based access, get automatic channel creation with permission overwrites, and close or delete tickets from a clean workflow.",
    modelFile: "models/TicketConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    // Both, because a ticket type with no panel posted leaves members with no
    // button anywhere, and /setup was calling that finished.
    required: ["ticketTypes", "panelMessageId"],
    configSubcommand: "tickets",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "welcome",
    mod: "welcome",
    configKey: "welcomeEnabled",
    label: "Welcome System",
    group: "Community",
    order: 120,
    short: "Greet new members with a channel message or DM",
    long:
      "Automatically greets every new member the moment they join, with an embedded welcome message carrying their avatar posted in your chosen channel, plus an optional private DM. Supports {user}, {server}, {username} and {memberCount} placeholders.",
    modelFile: "models/Welcome.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["channelId"],
    configSubcommand: "welcome",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "rolerequest",
    mod: "rolerequest",
    configKey: "roleRequestEnabled",
    label: "Role Requests",
    group: "Community",
    order: 130,
    short: "Members request roles; approvers approve or deny by DM",
    long:
      "Lets members request specific roles, whether department, whitelist or rank, without chasing staff. Each request goes straight to an assigned approver's DMs with Approve and Deny buttons, and approval grants the role instantly.",
    modelFile: "models/RoleRequestConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["roles"],
    configSubcommand: "roles",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "moveme",
    mod: "moveme",
    configKey: "movemeEnabled",
    label: "Voice Mover",
    group: "Community",
    order: 140,
    short: "Members move themselves between voice channels",
    long:
      "Posts a dropdown panel in any text channel. Members pick a voice channel and the bot moves them into it instantly, so no staff member has to drag people around. Restrict the list to specific channels, or allow them all.",
    modelFile: "models/MemberMovementConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["panelMessageId"],
    configSubcommand: "moveme",
    premiumDefault: false,
    botGated: true,
  },
  {
    key: "appys",
    mod: "appys",
    configKey: "appysEnabled",
    label: "Applications",
    group: "Community",
    order: 150,
    short: "Custom application panels with a DM Q&A flow",
    long:
      "Lets members apply for anything, whether staff, whitelist or events, through custom panels. The bot DMs them your questions one at a time, then drops submissions in a review channel with Accept/Deny buttons and automatic role assignment on approval.",
    modelFile: "models/AppyConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["reviewChannelId", "panelChannelId"],
    configSubcommand: "appys",
    premiumDefault: true,
    botGated: true,
  },
  {
    key: "sticky",
    mod: "sticky",
    configKey: "",
    label: "Sticky Messages",
    group: "Community",
    order: 160,
    short: "Auto-reposting messages that stay at the bottom of a channel",
    long:
      "Keeps your most important message pinned to the bottom of a channel. The bot reposts it every few messages so rules, join links, and announcements never scroll away. Configured per channel from Discord or the dashboard.",
    modelFile: "models/Sticky.js",
    modelImport: "default",
    enabledPath: "",
    required: ["channelId", "messageContent"],
    configSubcommand: "sticky",
    premiumDefault: false,
    botGated: false,
  },
  {
    key: "reactionroles",
    mod: "reactionroles",
    configKey: "",
    label: "Reaction Roles",
    group: "Community",
    order: 170,
    short: "Members react to a message to receive a role",
    long:
      "Members give themselves roles by reacting to a message you post. Set up to five emoji-role pairs per message so anyone can pick their own department, pronouns, or ping preferences without pulling in staff.",
    modelFile: "models/ReactionRole.js",
    modelImport: "default",
    enabledPath: "",
    required: ["emojiRoles"],
    configSubcommand: "reactionroles",
    premiumDefault: false,
    botGated: false,
  },

  // ------------------------------------------------------------------------
  // Economy
  // ------------------------------------------------------------------------
  {
    key: "economy",
    mod: "economy",
    configKey: "economyEnabled",
    label: "Economy",
    group: "Economy",
    order: 180,
    short: "Currency, work, crime, gambling, shops and businesses",
    long:
      "Gives members a full server currency: cash and bank balances, work, crime and robbery commands, casino gambling, role-based income and deductions, plus a shop of 140+ GTA V vehicles and custom items to buy, use and resell.",
    modelFile: "models/EconomyConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: [],
    configSubcommand: "economy",
    premiumDefault: false,
    botGated: false,
  },
  {
    key: "civjobs",
    mod: "civjobs",
    configKey: "civjobsEnabled",
    label: "Civilian Jobs",
    group: "Economy",
    order: 190,
    short: "Job board with shift-based roles that expire automatically",
    long:
      "Posts a job board where members pick a civilian job and instantly receive its role. Each shift runs for a set number of hours, then the bot removes the role automatically, with no staff cleanup.",
    modelFile: "models/CivilianJobConfig.js",
    modelImport: "default",
    enabledPath: "enabled",
    required: ["channelId", "jobs", "messageId"],
    configSubcommand: "civjobs",
    premiumDefault: false,
    botGated: false,
  },
];

/** One feature by its premium key. */
export function getFeature(key) {
  return FEATURES.find((f) => f.key === key) || null;
}

/** One feature by its dashboard/API mod slug. */
export function getFeatureByMod(mod) {
  return FEATURES.find((f) => f.mod === mod) || null;
}

/** Features that are premium when no FeatureFlag row exists. */
export const DEFAULT_PREMIUM_FEATURES = FEATURES.filter((f) => f.premiumDefault).map((f) => f.key);

/**
 * Mod slugs whose settings routes must be premium gated, derived rather than
 * hardcoded.
 *
 * A feature with a freeTier is deliberately absent: it still counts as premium
 * for checkFeatureAccess, so it still degrades at runtime, but a free server has
 * to be able to configure it or the free part is unreachable.
 */
export const PREMIUM_SETTINGS_MODS = FEATURES
  .filter((f) => f.premiumDefault && !f.freeTier)
  .map((f) => f.mod);

/** Ordered [groupTitle, features[]] pairs for menus and the sidebar. */
export function featureGroups() {
  const groups = [];
  for (const f of [...FEATURES].sort((a, b) => a.order - b.order)) {
    const last = groups[groups.length - 1];
    if (last && last[0] === f.group) last[1].push(f);
    else groups.push([f.group, [f]]);
  }
  return groups;
}
