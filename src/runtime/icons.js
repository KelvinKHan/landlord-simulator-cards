import icons from './icons.json' with { type: 'json' };

// SVG artwork is bundled with the runtime. Opening a menu never needs the Iconify API.
// Attribution and upstream source are retained in icon-licenses/.
const cache = new Map();
export function hasBuiltinIcon(name) { return Object.hasOwn(icons, name); }

export function iconUrl(name, color = 'black') {
  let tint;
  try { tint = decodeURIComponent(String(color)); } catch { tint = 'black'; }
  if (!/^(?:[a-z]+|#[a-f\d]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(tint)) tint = 'black';
  const resolved = hasBuiltinIcon(name) ? name : 'lucide:circle-help';
  const key = `${resolved}:${tint}`;
  if (cache.has(key)) return cache.get(key);
  const icon = icons[resolved];
  const body = icon.body.replaceAll('currentColor', tint);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${icon.width}" height="${icon.height}" viewBox="0 0 ${icon.width} ${icon.height}">${body}</svg>`;
  const result = `data:image/svg+xml,${encodeURIComponent(svg).replaceAll("'", '%27')}`;
  cache.set(key, result);
  return result;
}
