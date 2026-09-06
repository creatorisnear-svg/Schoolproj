/**
 * How commands are grouped for the public site.
 *
 * The landing page used to hand-list its commands in eight cards. It had drifted
 * to ~60 of 77 and was missing the entire business banking and loans system - 13
 * commands the bot has and the site never mentioned.
 *
 * This maps command names to sections; GET /api/public/commands joins it against
 * the commands the bot has actually registered, so descriptions and premium marks
 * come from the live command definitions and can never go stale.
 *
 * A command that exists but is not listed here lands in "Other" rather than
 * disappearing, and scripts/../test asserts that group is empty - so adding a
 * command without deciding where it belongs fails loudly instead of silently
 * dropping it off the site.
 *
 * Deprecated shims (description starts with "Moved") are filtered out by the API.
 */
export const COMMAND_GROUPS = [
  {
    title: 'Getting Started',
    blurb: 'Set the bot up and decide who can run it.',
    commands: ['setup', 'config', 'staff', 'help', 'invite', 'premium', 'activatepremium', 'activatetrial'],
  },
  {
    title: 'Verification & Moderation',
    blurb: 'Gate your server and deal with rule-breakers.',
    commands: ['verify', 'strike', 'removestrike', 'blacklist', 'removeblacklist', 'clear', 'embed'],
  },
  {
    title: 'Roleplay & CAD',
    blurb: 'Characters, vehicles, 911 calls and department records.',
    commands: ['civiliandatabase', 'leodatabase', 'firedepartmentdatabase'],
  },
  {
    title: 'Priority & Dispatch',
    blurb: 'Run priority scenes and AI voice dispatch.',
    commands: ['priorityrequest', 'activepriority', 'deactivatepriority', 'prioritycooldown', 'dispatchannounce'],
  },
  {
    title: 'Economy',
    blurb: 'Currency, jobs, crime, gambling and the shop.',
    commands: [
      'balance', 'deposit', 'withdraw', 'give', 'giveitems', 'income', 'work', 'crime',
      'rob', 'shop', 'buy', 'sell', 'use', 'inventory', 'gamble', 'leaderboard',
    ],
  },
  {
    title: 'Business & Loans',
    blurb: 'Business bank accounts, payroll, and a full lending system.',
    commands: [
      'business', 'businessinfo', 'businessleaderboard', 'businesstransfer', 'paybusiness',
      'businessadjust', 'businessloanconfig', 'businessloanpanel', 'businessloans',
      'loans', 'loanpay', 'loanapplications', 'loandefault',
    ],
  },
  {
    title: 'Community',
    blurb: 'Roles, applications, sticky messages and the RP calendar.',
    commands: [
      'rolerequest', 'manageroles', 'cancelapplication', 'reactionrolemessage',
      'sticky', 'stickylist', 'setrp', 'unsetrp',
    ],
  },
  {
    title: 'Utility',
    blurb: 'Occasional maintenance.',
    commands: ['reloadconfig'],
  },
];

/** Group title for one command name, or null when it is unmapped. */
export function groupForCommand(name) {
  for (const g of COMMAND_GROUPS) {
    if (g.commands.includes(name)) return g.title;
  }
  return null;
}

/** Every command name this file claims to place. */
export function mappedCommandNames() {
  return COMMAND_GROUPS.flatMap((g) => g.commands);
}
