const STORAGE_KEY = 'landlord:version-controls:position';
const SIZE = 56, GAP = 10, MARGIN = 8;
const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));

/** Drag only the launcher: selects and scrollable content keep native behavior. */
export function makeVersionFloating({host, panel, handle, body}) {
  const listeners = [];
  let disposed = false, frame = null, drag = null, suppressClick = false;
  function bounds() {
    const viewport = host.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    return {left:left+MARGIN, top:top+MARGIN,
      right:left+(viewport?.width || host.innerWidth)-MARGIN,
      bottom:top+(viewport?.height || host.innerHeight)-MARGIN};
  }
  const initial = bounds();
  let position = {x:initial.left+4, y:Math.max(initial.top, initial.bottom-SIZE-86)};
  try {
    const saved = JSON.parse(host.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) position = {x:saved.x, y:saved.y};
  } catch { /* Storage is optional; controls must work in restricted browsers too. */ }
  function save() {
    try { host.localStorage.setItem(STORAGE_KEY, JSON.stringify(position)); } catch {}
  }
  function layout() {
    if (disposed) return;
    const viewport = bounds();
    position.x = clamp(position.x, viewport.left, viewport.right-SIZE);
    position.y = clamp(position.y, viewport.top, viewport.bottom-SIZE);
    panel.style.left = `${position.x}px`;
    panel.style.top = `${position.y}px`;
    panel.style.bottom = panel.style.right = 'auto';
    if (!panel.open) return;
    const width = Math.min(340, viewport.right-viewport.left);
    body.style.width = `${width}px`;
    let x, y;
    if (position.x+SIZE+GAP+width <= viewport.right || position.x-GAP-width >= viewport.left) {
      body.style.maxHeight = `${viewport.bottom-viewport.top}px`;
      const height = body.getBoundingClientRect().height;
      x = position.x+SIZE+GAP+width <= viewport.right ? position.x+SIZE+GAP : position.x-GAP-width;
      y = clamp(position.y, viewport.top, viewport.bottom-height);
    } else {
      // With no side space, shorten the body and scroll it instead of covering the ball.
      const above = position.y-GAP-viewport.top;
      const below = viewport.bottom-position.y-SIZE-GAP;
      const useAbove = above >= below;
      body.style.maxHeight = `${Math.max(1, useAbove ? above : below)}px`;
      const height = body.getBoundingClientRect().height;
      x = clamp(position.x, viewport.left, viewport.right-width);
      y = useAbove ? position.y-GAP-height : position.y+SIZE+GAP;
    }
    body.style.left = `${x-position.x}px`;
    body.style.top = `${y-position.y}px`;
  }
  function schedule() {
    if (disposed || frame !== null) return;
    frame = host.requestAnimationFrame(() => { frame = null; layout(); });
  }
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function start(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressClick = false;
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY, start:{...position}, moved:false};
    try { handle.setPointerCapture(event.pointerId); } catch {}
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX-drag.x, dy = event.clientY-drag.y;
    if (!drag.moved && Math.hypot(dx,dy) < 5) return;
    drag.moved = true;
    event.preventDefault();
    position = {x:drag.start.x+dx, y:drag.start.y+dy};
    panel.classList.add('is-dragging');
    layout();
  }
  function end(event) {
    if (!drag || event.pointerId !== drag.id) return;
    suppressClick = drag.moved;
    if (drag.moved) { event.preventDefault(); save(); }
    drag = null;
    panel.classList.remove('is-dragging');
    try { handle.releasePointerCapture(event.pointerId); } catch {}
  }
  function cancel(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null; suppressClick = true;
    panel.classList.remove('is-dragging');
    try { handle.releasePointerCapture(event.pointerId); } catch {}
  }
  listen(handle, 'pointerdown', start);
  listen(host.document, 'pointermove', move, {passive:false});
  listen(host.document, 'pointerup', end);
  listen(host.document, 'pointercancel', cancel);
  listen(handle, 'lostpointercapture', cancel);
  listen(handle, 'click', event => {
    if (suppressClick && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
    suppressClick = false;
  }, true);
  listen(panel, 'toggle', () => { handle.setAttribute('aria-expanded', String(panel.open)); layout(); });
  listen(panel, 'keydown', event => {
    if (event.key === 'Escape' && panel.open && event.target.tagName !== 'SELECT') {
      panel.open = false; handle.focus(); event.preventDefault();
    }
  });
  listen(host, 'resize', schedule);
  if (host.visualViewport) {
    listen(host.visualViewport, 'resize', schedule);
    listen(host.visualViewport, 'scroll', schedule);
  }
  const observer = new host.ResizeObserver(schedule);
  observer.observe(body);
  handle.setAttribute('aria-expanded', String(panel.open));
  layout();
  return {
    layout:schedule,
    dispose() {
      disposed = true;
      if (drag) { try { handle.releasePointerCapture(drag.id); } catch {} }
      drag = null;
      listeners.splice(0).forEach(remove => remove());
      observer.disconnect();
      if (frame !== null) host.cancelAnimationFrame(frame);
    },
  };
}
