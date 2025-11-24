// Capitalize first and last names
export function capitalizeName(name) {
  if (!name || typeof name !== 'string') return name;
  
  // Split by spaces and capitalize each word
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
