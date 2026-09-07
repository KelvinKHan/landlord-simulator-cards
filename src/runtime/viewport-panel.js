/** SillyTavern transforms its zero-height <html>. Give bottom-aligned controls
 * their own viewport-sized containing block instead of anchoring to that root. */
export function mountViewportPanel(host, panel, zIndex) {
  const doc = host.document;
  const id = `${panel.id}-viewport`;
  doc.getElementById(id)?.remove();
  const layer = doc.createElement('div');
  layer.id = id;
  layer.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100vh;height:100dvh;pointer-events:none;z-index:${zIndex};`;
  panel.style.position = 'absolute';
  panel.style.pointerEvents = 'auto';
  layer.append(panel);
  doc.body.append(layer);
  return () => layer.remove();
}
