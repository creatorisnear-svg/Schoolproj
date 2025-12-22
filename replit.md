# EverLink Discord Bot

## Overview
EverLink is a Discord bot designed for multi-server roleplay and gaming communities, particularly those involved in GTA5 RP. Its core purpose is to streamline community management through features like emergency reporting (911), member verification, staff management, a strike system, priority tracking, a roleplay calendar, sticky messages, anti-promoting, reaction roles, and a role request system. The bot offers independent configuration for each server, enhancing administration and member experience in roleplaying environments.

## Recent Changes (Dec 22, 2025)
- **Added Terms of Service endpoint** (`/terms`) for Discord bot verification
  - Accessible at: `https://<koyeb-domain>/terms`
  - Includes: User agreement, compliance info, data handling, liability, and support links
  - Ready for Discord Developer Portal submission
- **Fixed priorityrequest command** by adding numeric prefix (15_priorityrequest.js)
  - Command now loads and registers properly with all other commands
- **Bot is deployed on Koyeb** with keep-alive heartbeat polling every 4 minutes
- All 35 commands (including priorityrequest) loaded and registered successfully
- Fixed calendar event cleanup logic: changed from day-based filtering to age-based (events delete after 7 days, not by day of week)
- Added `createdAt` timestamp to RoleplayCalendar event schema for proper event age tracking
- Fixed roleplaycalendersetup command timeout by removing unnecessary defer and using direct reply
- Verified reaction role data persistence in MongoDB works correctly
- Fixed Discord bot login by updating DISCORD_TOKEN secret
- Enhanced interaction error handling to gracefully catch API errors
- Changed ready event from 'ready' to 'clientReady' for Discord.js v14 compatibility

## User Preferences
- All bot responses must use Discord embeds
- EverLink branding on all embeds (footer: "EverLink")
- MongoDB for persistent data storage
- Staff and Admins have full access to all commands
- General members restricted to roleplay/verification commands only

## Permission Structure
**Admins** - Can use ALL commands (includes all staff permissions)
- **Admin-Only Commands:** `/addstaff`, `/removestaff`
**Staff** - Added via `/addstaff`, can use all administrative commands
**General Members** - Can use roleplay/verification commands and member-level economy commands

## System Architecture
The EverLink Discord bot is built on Node.js (v20) using the Discord.js v14 library, with MongoDB Atlas for persistent data storage.

**UI/UX Decisions:**
- All bot responses leverage Discord embeds for a clean, professional, and branded interface.
- Embeds consistently feature "EverLink" branding in the footer.
- Interactive elements utilize Discord dropdown selectors, modals, and buttons.
- Configuration fallback messages are provided for unconfigured features.

**Technical Implementations & Feature Specifications:**
- **Modular System Design:** Features are independent and per-server configurable.
- **Permission System:** Commands are gated by Discord Administrator permissions (Admins/Staff) or a custom staff database. Admins inherit all staff permissions.
- **Logging System:** A central log channel (`/setlogchannel`) is used for event reporting.
- **Roleplay Commands System:** All roleplay commands (911, Twitter, Anon, CAD) are accessed through menu-based database commands (`/civiliandatabase`, `/leodatabase`, `/firedepartmentdatabase`).
    - **Emergency System:** Tracks 911 calls with unique IDs, supports primary response and unit attachment, pings configured roles, and updates interactive messages. Calls auto-delete after 10 minutes.
    - **CAD System:** Provides full GTA5 RP CAD with character and vehicle management for LEO/Fire Department roleplay.
    - **Character Creation:** A redesigned 3-step process for creating character profiles, including basic info, physical description, and status selection.
    - **LEO Character Search:** Enhanced display of character profiles with traffic tickets, active BOLOs, and status alerts (e.g., red embed for BOLO/wanted characters).
- **Verification System:** Customizable RP tags, questions, welcome messages, and automatic role assignment.
- **Strike System:** Multi-level (1-4) with customizable actions (role assignment, kick, timeout, ban).
- **Priority Tracker:** Real-time status updates for priority events with cooldowns.
- **Roleplay Calendar:** Weekly RP events with automatic timezone conversion.
- **Sticky Messages:** Auto-reposts every 1 message with a "__**Stickied Message:**__" prefix.
- **Anti-Promoting System:** Detects and removes non-whitelisted Discord invite links with a staff bypass option.
- **Reaction Role System:** Up to 5 emoji-role pairs per message (works with ANY message, not just bot-created ones). Configurable channel and message IDs for external messages.
- **Ticket Support System:** Custom ticket types with role access control and automatic channel creation.
- **Role Request System:** Allows members to request roles and staff to approve/deny via DMs. Configurable for specific roles and approvers.
- **Status Heartbeat System:** Background system that sends periodic heartbeat messages to the support server (every 8 minutes). Other bots can listen for these messages to monitor EverLink status. Messages auto-delete after 1 minute. Automatically enabled on support server via `SUPPORT_SERVER_ID` environment variable.
- **Database Integration:** Mongoose schemas ensure per-server data isolation and persistence.

**Core Workflow for Feature Management:**
- A unified `/enablecommands` command provides a step-by-step UX flow for enabling or disabling features.
- Users select "Enable Features" or "Disable Features" and then choose specific features via buttons.

---

# ECONOMY SYSTEM - COMPLETE SPECIFICATION

## OVERVIEW
Full economy system with role-based income, work/crime commands, gambling, store/inventory, and granular permission controls.

## COMMAND STRUCTURE

### STAFF COMMANDS - `/economysetup` (Menu-based)
**Permission Gating**: Must be enabled in global command enablecommands
- If disabled: Shows "❌ `/economysetup` is currently disabled. Enable it in command enablecommands"

**Currency & Balance:**
- Set Currency Symbol
- Set Start Balance
- Set Maximum Balance (cash + bank combined)

**Money Management:**
- Add Money (Member)
- Add Money (Role) - all members in role
- Remove Money (Member)
- Remove Money (Role)
- Reset Member Balance
- Reset Economy (wipe all balances)
- Set Log Channel (tracks all transactions)
- Clean Leaderboard (remove left users)
- Economy Stats (display circulation, richest members, averages)

**Work/Crime System:**
- Set Work/Crime Cooldown (per-user cooldown)
- Set Payouts (min/max for work/slut/crime)
- Set Fail Rate (% chance to fail)
- Set Fine Amount (min/max deducted on failure)
- Set Fine Type (percent of winnings OR fixed amount)
- Add Success Reply (custom message when success)
- Add Fail Reply (custom message when failure)
- Delete Reply (remove custom reply)
- View Custom Replies (link to dashboard)
- Toggle Default Replies (use defaults if no custom ones)

**Role Income & Earning:**
- Set Role Income (amount per role + cooldown)
  - Optional: Add Income Fines (bills/expenses deducted on claim)
  - Example: Property Bills ($50), Water Bills ($25)
  - Multiple fines allowed per role
- Set Role Income Channel (persistent embed with claim button)
  - Embed stays in channel permanently
  - One button for all members to use repeatedly
  - Member-only view in DM
  - Fines auto-deducted from role income on claim
- Set Chat Money Amount (min/max per message)
- Set Chat Money Channels (which channels earn money)
- Set Chat Money Cooldown (per-user cooldown between earnings)

**Gambling Setup:**
- Set Bet Limit (min/max bet amount)
- Set Blackjack Decks (number of decks)
- Set Game Cooldown (per-user per-game cooldown)
- Set Slot Machine Symbols (customize symbols)
- Set Cock-Fight Win Chance (adjust odds %)

**Permission Management:**
- Disable Command/Module (individual features)
- Enable Command/Module
- Manage Permissions (role/user allow/deny)
- Channel Override (enable/disable per channel)
- Test Command (check if enabled)
- Command Status (view all enabled/disabled)

**Staff Store Management - `/storesetup` (Menu-based):**
- Create Item (add to store)
- Edit Item (modify details)
- Delete Item (remove from store)
- View Item Options (editable properties)

---

### MEMBER COMMANDS - `/economy` (Menu-based)
**Permission Gating**: Must be enabled in global command enablecommands
- If disabled: Shows "❌ `/economy` is currently disabled. Enable it in command enablecommands"

**Balance & Banking:**
- Check Money (view cash, bank, total)
- View Leaderboard (top members + user rank)
- Deposit (cash → bank)
- Withdraw (bank → cash)
- Give Money (transfer to another member)

**Money-Making:**
- Work (random success/fail, earns payout or fined)
- Slut (higher risk/reward version)
- Crime (highest risk, biggest payout/fine)
- Rob (attempt to steal from player - fails if insufficient cash)
- Collect Role Income (claim button in income channel - member-only DM confirmation)

**Games/Gambling:**
- Blackjack (play 21 vs dealer, bet cash)
- Roulette (spin wheel, pick number/color)
- Roulette Info (display rules/odds)
- Cock-Fight (pick winning chicken, bet cash)
- Russian Roulette (50/50 high-stakes game)
- Roll (roll dice or random selection)
- Slot Machine (spin slots, match symbols)

**Store/Inventory:**
- View Store (list items for sale)
- View Inventory (items you own)
- Item Info (details on store item)
- Buy Item (purchase from store - cash deduction)
- Sell Item (sell to store - cash addition)
- Use Item (consume/activate item)
- Give Item (trade to another member)

---

## DATABASE SCHEMA

**User Economy Document:**
```
{
  userId: "string",
  guildId: "string",
  cash: number,
  bank: number,
  totalEarned: number,
  totalSpent: number,
  lastUpdated: timestamp
}
```

**User Inventory:**
```
{
  userId: "string",
  guildId: "string",
  items: [
    { itemId: string, quantity: number, acquiredAt: timestamp }
  ]
}
```

**Fine Account:**
```
{
  userId: "string",
  guildId: "string",
  pendingFines: number,
  totalFinesPaid: number,
  fineHistory: [
    { command: string, amount: number, fineAt: timestamp, paid: boolean }
  ]
}
```

**Server Config:**
```
{
  guildId: "string",
  currency: { symbol: string, startBalance: number, maxBalance: number },
  logChannelId: string,
  
  workSystem: {
    cooldown: number (ms),
    payoutMin: number,
    payoutMax: number,
    failRate: number (0-100),
    fineType: "percent" | "fixed",
    finePercentage: number (if percent),
    fineMin: number (if fixed),
    fineMax: number (if fixed)
  },
  
  roleIncome: [
    {
      roleId: string,
      amount: number,
      claimCooldown: number (ms),
      incomeFines: [
        { name: string, amount: number }
      ]
    }
  ],
  
  roleIncomeChannelId: string,
  
  chatMoney: {
    minAmount: number,
    maxAmount: number,
    cooldown: number (ms),
    channels: [string] // channel IDs
  },
  
  gambling: {
    betMin: number,
    betMax: number,
    blackjackDecks: number,
    gameCooldown: number (ms),
    slotSymbols: [string],
    cockFightWinChance: number (0-100)
  },
  
  enabledFeatures: {
    work: boolean,
    slut: boolean,
    crime: boolean,
    rob: boolean,
    blackjack: boolean,
    roulette: boolean,
    cockFight: boolean,
    russianRoulette: boolean,
    roll: boolean,
    slots: boolean,
    store: boolean
  }
}
```

**Store Item:**
```
{
  itemId: string,
  guildId: string,
  name: string,
  price: number,
  description: string,
  rarity: string,
  buyPrice: number,
  sellPrice: number,
  consumable: boolean,
  createdBy: string (userId),
  createdAt: timestamp
}
```

**Custom Replies:**
```
{
  guildId: string,
  command: "work" | "slut" | "crime",
  successReplies: [string],
  failReplies: [string],
  useDefaults: boolean
}
```

---

## KEY MECHANICS

**Balance System:**
- One document per user: {cash, bank, totalEarned, totalSpent}
- Cash: Direct earnings, bets, transactions
- Bank: Safe storage, transfers between accounts
- Max balance prevents exploitation

**Work/Crime/Slut:**
- Random success/fail based on fail-rate percentage
- Success: Random payout between min/max
- Fail: Random fine between min/max (or % of would-be payout)
- Custom success/fail replies or default messages
- Per-user cooldown prevents spam

**Betting:**
- Members bet from CASH only (not bank)
- Per-user per-game cooldown
- Winnings go to cash
- Prevents negative balance (stops at 0)

**Role Income:**
- Periodic income from assigned roles
- Claim-based (not auto-distributed)
- Sent via embed button in designated channel
- Optional recurring fines/bills auto-deducted
- Per-role per-user cooldown (separate cooldowns for Police/Fire/etc)
- Member-only confirmation in DM

**Chat Money:**
- Auto-reward when messaging in designated channels
- Random amount between min/max
- Per-user cooldown between earnings
- Only adds, never deducts

**Games:**
- Betting from cash only
- Per-user per-game cooldown
- Cannot exceed max balance on wins
- Random outcomes for fairness

**Store/Inventory:**
- Items bought with cash, deducted immediately
- Items sold to store for set price
- Consumable items can be "used"
- Items transferable between members
- Rarity system for organization

**Permission Gating:**
- Tier 1: Global `/economysetup` and `/economy` must be enabled
- Tier 2: Staff can enable/disable individual features within economysetup
- Members cannot use `/economy` if globally disabled
- Shows clear error message directing to staff

---

## IMPORTANT DETAILS

- Fines deduct from CASH only, never bank
- If fine > available cash, balance goes to 0
- Fines cleared after deduction
- Role income fines auto-deduct on claim
- Chat money only in designated channels
- Cooldowns are per-user (not server-wide for most)
- Cannot go negative on any transaction
- All transactions logged in audit channel
- Leaderboard only shows active members
- Blackjack uses standard deck rules
- Roulette has 37 spaces (0-36)
- Russian roulette is 50/50 binary

---

## External Dependencies
- **Discord.js v14:** Primary library for interacting with the Discord API.
- **MongoDB Atlas:** Cloud-hosted NoSQL database for persistent data storage.
- **Mongoose:** Object Data Modeling (ODM) library for MongoDB.
- **Express:** Used for HTTP server functionality (e.g., health checks).
- **Dotenv:** For managing environment variables.
- **UUID:** For generating unique identifiers (e.g., for role request configurations).
