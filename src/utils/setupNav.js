import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Back-navigation for the setup wizard.
 *
 * Every wizard screen used to be a dead end. interaction.update() replaces the
 * message and none of the screens carried a way back, so configuring three
 * features meant typing /setup three times. Worse, a premium wall or an error
 * replied with components: [] and left the owner nothing to click at all.
 *
 * Applied at the single dispatch point in setupWizardHandler rather than in
 * fifteen individual handlers, so screens added later get it for free.
 */

export const SETUP_HUB_ID = 'setup_hub';

export function backRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SETUP_HUB_ID)
      .setLabel('← Back to Setup')
      .setStyle(ButtonStyle.Secondary)
  );
}

/** Append the back row to an interaction payload, unless it is already there. */
export function withBackRow(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const components = Array.isArray(payload.components) ? payload.components.slice() : [];

  // Discord allows at most five action rows per message.
  if (components.length >= 5) return payload;

  const alreadyThere = components.some((row) => {
    try {
      const json = typeof row?.toJSON === 'function' ? row.toJSON() : row;
      return JSON.stringify(json).includes(SETUP_HUB_ID);
    } catch {
      return false;
    }
  });
  if (alreadyThere) return payload;

  components.push(backRow());
  return { ...payload, components };
}

/**
 * Proxy that appends the back row to whatever a handler passes to update().
 * Everything else forwards untouched; methods stay bound to the real interaction.
 */
export function withSetupNav(interaction) {
  return new Proxy(interaction, {
    get(target, prop) {
      if (prop === 'update') {
        return (payload) => target.update(withBackRow(payload));
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
