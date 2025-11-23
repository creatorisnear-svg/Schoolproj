export function detectDiscordInvite(text) {
  const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[^\s]+/gi;
  const matches = text.match(inviteRegex);
  return matches || [];
}

export function extractInviteCode(inviteLink) {
  const match = inviteLink.match(/(?:discord\.gg\/|discordapp\.com\/invite\/)([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
