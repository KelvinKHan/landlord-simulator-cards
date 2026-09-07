/** Keep our controls outside SillyTavern's transformed, scrollable root without
 * changing host styles. Manual popovers are non-modal and don't take focus. */
export function mountViewportPanel(host, panel, zIndex) {
  const doc = host.document;
  const id = `${panel.id}-viewport`;
  doc.getElementById(id)?.remove();
  let overlay = doc.getElementById('landlord-controls-overlay');
  if (!overlay) {
    overlay = doc.createElement('div');
    overlay.id = 'landlord-controls-overlay';
    const hasPopover = typeof overlay.showPopover === 'function';
    const position = !hasPopover && host.getComputedStyle(doc.body).position === 'fixed' ? 'absolute' : 'fixed';
    overlay.style.cssText = `position:${position};inset:auto;top:0;left:0;margin:0;padding:0;border:0;box-sizing:border-box;width:100vw;height:100vh;height:100dvh;max-width:none;max-height:none;overflow:clip;background:transparent;color:inherit;pointer-events:none;z-index:100002;`;
    const style = doc.createElement('style');
    style.textContent = '#landlord-controls-overlay::backdrop{pointer-events:none!important;background:transparent!important}';
    overlay.append(style);
    if (hasPopover) overlay.setAttribute('popover', 'manual');
    doc.body.append(overlay);
    if (hasPopover) overlay.showPopover();
  }
  const layer = doc.createElement('div');
  layer.id = id;
  layer.setAttribute('data-landlord-panel-layer', '');
  layer.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:${zIndex};`;
  panel.style.position = 'absolute';
  panel.style.pointerEvents = 'auto';
  layer.append(panel);
  overlay.append(layer);
  return () => {
    layer.remove();
    if (!overlay.querySelector('[data-landlord-panel-layer]')) {
      if (typeof overlay.hidePopover === 'function' && overlay.matches(':popover-open')) overlay.hidePopover();
      overlay.remove();
    }
  };
}
