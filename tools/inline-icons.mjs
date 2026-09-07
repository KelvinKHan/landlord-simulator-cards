import { hasBuiltinIcon, iconUrl } from '../src/runtime/icons.js';

// Convert complete legacy URLs before parsing JS, including URLs inside HTML templates.
// Dynamic URLs use landlord.iconUrl() so none reach a player's network.
export function inlineIconUrls(source) {
  return source.replace(/https:\/\/api\.iconify\.design\/([a-z0-9-]+:[a-z0-9-]+)\.svg(?:\?color=([a-zA-Z0-9%#]+))?/g, (_url, name, color) => {
    if (!hasBuiltinIcon(name)) throw new Error(`请先打包新增图标：${name}`);
    return iconUrl(name, color);
  });
}
