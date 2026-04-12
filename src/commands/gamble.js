import { SlashCommandBuilder } from 'discord.js';
import {
  runBlackjack, runRoulette, runSlots,
  runDiceRoll, runRussianRoulette, runCockFight,
} from '../handlers/economyActions.js';

export const data = new SlashCommandBuilder()
  .setName('gamble')
  .setDescription('Play casino games to win or lose money')
  .addSubcommand(sub =>
    sub.setName('blackjack')
      .setDescription('Play a hand of blackjack')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('roulette')
      .setDescription('Spin the roulette wheel')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
      .addStringOption(opt => opt.setName('choice').setDescription('red, black, or green').setRequired(true).addChoices(
        { name: 'Red (2x)', value: 'red' },
        { name: 'Black (2x)', value: 'black' },
        { name: 'Green (14x)', value: 'green' },
      ))
  )
  .addSubcommand(sub =>
    sub.setName('slots')
      .setDescription('Pull the slot machine')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('dice')
      .setDescription('Roll dice — higher total wins')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('russianroulette')
      .setDescription('1/6 chance of losing all your cash')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub.setName('cockfight')
      .setDescription('50/50 fight for 1.8x payout')
      .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1))
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const bet = interaction.options.getInteger('bet');
  if (sub === 'blackjack') return runBlackjack(interaction, bet);
  if (sub === 'roulette') {
    const choice = interaction.options.getString('choice');
    return runRoulette(interaction, bet, choice);
  }
  if (sub === 'slots') return runSlots(interaction, bet);
  if (sub === 'dice') return runDiceRoll(interaction, bet);
  if (sub === 'russianroulette') return runRussianRoulette(interaction, bet);
  if (sub === 'cockfight') return runCockFight(interaction, bet);
}
