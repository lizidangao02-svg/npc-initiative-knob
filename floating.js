import { KEY } from './core.js';

const SIZE = 52;
const GAP = 12;
const DEFAULT_POSITION = { x: 1, y: 0.65 };
const clamp = (value, min, max) => Math.min(Math.max(min, value), Math.max(min, max));

export function mountFloatingPanel(panel, { getPosition, savePosition }) {
    const root = document.createElement('div');
    root.id = `${KEY}_floating`;
    root.dataset.open = 'false';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${KEY}_toggle`;
    trigger.setAttribute('aria-controls', KEY);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', '展开 NPC 主动性');
    trigger.setAttribute('aria-describedby', `${KEY}_move_help`);
    trigger.innerHTML = '<svg class="npc-knob-compass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></svg><svg class="npc-knob-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    const help = document.createElement('span');
    help.id = `${KEY}_move_help`;
    help.className = 'npc-knob-sr-only';
    help.textContent = '拖动悬浮球可移动位置，也可使用方向键移动，Home 键复位。';
    panel.classList.add('npc-knob-popover');
    panel.setAttribute('role', 'dialog');
    panel.hidden = true;
    panel.inert = true;
    root.append(trigger, panel, help);
    document.body.append(root);

    const cleanups = [];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let open = false;
    let destroyed = false;
    let drag;
    let suppressClickUntil = 0;
    let panelAnimation;
    let positionAnimation;
    let x = 0;
    let y = 0;

    function listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        cleanups.push(() => target.removeEventListener(type, handler, options));
    }
    function viewport() {
        const v = window.visualViewport;
        const safe = getComputedStyle(root);
        const left = (v?.offsetLeft || 0) + GAP + (parseFloat(safe.getPropertyValue('--npc-safe-left')) || 0);
        const top = (v?.offsetTop || 0) + GAP + (parseFloat(safe.getPropertyValue('--npc-safe-top')) || 0);
        const right = (v?.offsetLeft || 0) + (v?.width || document.documentElement.clientWidth) - GAP - (parseFloat(safe.getPropertyValue('--npc-safe-right')) || 0);
        const bottom = (v?.offsetTop || 0) + (v?.height || innerHeight) - GAP - (parseFloat(safe.getPropertyValue('--npc-safe-bottom')) || 0);
        return { left, top, right, bottom };
    }
    function position() {
        const p = getPosition();
        return {
            x: Number.isFinite(p?.x) ? clamp(p.x, 0, 1) : p?.side === 'left' ? 0 : 1,
            y: Number.isFinite(p?.y) ? clamp(p.y, 0, 1) : DEFAULT_POSITION.y,
        };
    }
    function moveTo(nextX, nextY) {
        x = nextX;
        y = nextY;
        root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    function layout() {
        if (destroyed || drag?.moved) return;
        const v = viewport();
        const p = position();
        moveTo(v.left + p.x * Math.max(0, v.right - v.left - SIZE), v.top + p.y * Math.max(0, v.bottom - v.top - SIZE));
        if (panel.hidden) return;
        const width = Math.min(380, v.right - v.left);
        panel.style.width = `${width}px`;
        panel.style.maxHeight = `${v.bottom - v.top}px`;
        let height = panel.getBoundingClientRect().height;
        // Use layout dimensions rather than the animated, scaled rectangle.
        height = panel.offsetHeight || height;
        let panelX;
        let panelY;
        const leftSpace = x - v.left;
        const rightSpace = v.right - x - SIZE;
        const panelOnLeft = leftSpace >= width + GAP || rightSpace < width + GAP && leftSpace >= rightSpace;
        const fitsBeside = leftSpace >= width + GAP || rightSpace >= width + GAP;
        if (fitsBeside) {
            panelX = panelOnLeft ? x - GAP - width : x + SIZE + GAP;
            panelY = clamp(y + SIZE / 2 - height / 2, v.top, v.bottom - height);
        } else {
            panelX = clamp(p.side === 'right' ? x + SIZE - width : x, v.left, v.right - width);
            const above = y - GAP - v.top;
            const below = v.bottom - y - SIZE - GAP;
            const useAbove = above >= Math.min(height, 240) || above >= below;
            panel.style.maxHeight = `${Math.max(0, useAbove ? above : below)}px`;
            height = panel.offsetHeight;
            panelY = useAbove ? y - GAP - height : y + SIZE + GAP;
        }
        panel.style.left = `${panelX - x}px`;
        panel.style.top = `${panelY - y}px`;
        panel.style.transformOrigin = `${x + SIZE / 2 - panelX}px ${y + SIZE / 2 - panelY}px`;
    }
    function setOpen(next, { restoreFocus = false, animate = true } = {}) {
        if (destroyed || (open === next && !panelAnimation)) return;
        const wasVisible = !panel.hidden;
        const currentStyle = wasVisible ? getComputedStyle(panel) : null;
        const from = wasVisible ? { opacity: currentStyle.opacity, transform: currentStyle.transform } : { opacity: 0, transform: 'scale(.32)' };
        panelAnimation?.cancel();
        panelAnimation = undefined;
        open = next;
        root.dataset.open = String(open);
        trigger.setAttribute('aria-expanded', String(open));
        trigger.setAttribute('aria-label', `${open ? '收起' : '展开'} NPC 主动性`);
        panel.inert = !open;
        if (open) {
            positionAnimation?.cancel();
            document.querySelectorAll('.openDrawer:not(.pinnedOpen)').forEach(drawer => {
                drawer.classList.remove('openDrawer');
                drawer.classList.add('closedDrawer');
            });
            document.querySelectorAll('.openIcon:not(.drawerPinnedOpen)').forEach(icon => {
                icon.classList.remove('openIcon');
                icon.classList.add('closedIcon');
            });
        }
        if (restoreFocus || (!open && panel.contains(document.activeElement))) trigger.focus({ preventScroll: true });
        if (open) panel.hidden = false;
        layout();
        if (!animate || typeof panel.animate !== 'function' || (!open && !wasVisible)) {
            panel.hidden = !open;
            return;
        }
        const gentle = reducedMotion.matches;
        if (gentle) from.transform = 'none';
        const to = { opacity: open ? 1 : 0, transform: open || gentle ? 'none' : 'scale(.32)' };
        const animation = panel.animate([from, to], {
            duration: gentle ? 90 : open ? 260 : 170,
            easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'both',
        });
        panelAnimation = animation;
        animation.onfinish = () => {
            if (panelAnimation !== animation) return;
            panel.hidden = !open;
            animation.cancel();
            panelAnimation = undefined;
        };
    }
    function moveToSavedPosition(nextPosition, animate = true) {
        if (!panel.hidden) setOpen(false, { animate: false });
        const from = root.style.transform;
        positionAnimation?.cancel();
        savePosition(nextPosition);
        layout();
        if (animate && !reducedMotion.matches && root.animate && from !== root.style.transform) {
            positionAnimation = root.animate([{ transform: from }, { transform: root.style.transform }], {
                duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            });
        }
    }
    function finishDrag(event, cancel = false) {
        if (!drag || event.pointerId !== drag.id) return;
        const moved = drag.moved;
        drag = undefined;
        delete root.dataset.dragging;
        if (trigger.hasPointerCapture(event.pointerId)) trigger.releasePointerCapture(event.pointerId);
        if (!moved) return;
        suppressClickUntil = cancel ? 0 : performance.now() + 400;
        if (cancel) { layout(); return; }
        const v = viewport();
        moveToSavedPosition({ x: clamp((x - v.left) / Math.max(1, v.right - v.left - SIZE), 0, 1), y: clamp((y - v.top) / Math.max(1, v.bottom - v.top - SIZE), 0, 1) });
    }

    listen(trigger, 'click', event => {
        if (event.detail > 0 && performance.now() < suppressClickUntil) {
            suppressClickUntil = 0;
            return;
        }
        setOpen(!open);
    });
    listen(trigger, 'pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false) return;
        const bounds = root.getBoundingClientRect();
        positionAnimation?.cancel();
        moveTo(bounds.x, bounds.y);
        drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, moved: false };
        trigger.setPointerCapture(event.pointerId);
    });
    listen(trigger, 'pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        root.dataset.dragging = 'true';
        if (!panel.hidden) setOpen(false, { animate: false });
        const v = viewport();
        moveTo(clamp(drag.x + dx, v.left, v.right - SIZE), clamp(drag.y + dy, v.top, v.bottom - SIZE));
        event.preventDefault();
    });
    listen(trigger, 'pointerup', event => finishDrag(event));
    listen(trigger, 'pointercancel', event => finishDrag(event, true));
    listen(trigger, 'lostpointercapture', event => finishDrag(event, true));
    listen(trigger, 'keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
        event.preventDefault();
        const p = position();
        const v = viewport();
        if (event.key === 'Home') moveToSavedPosition({ ...DEFAULT_POSITION });
        else moveToSavedPosition({
            x: clamp(p.x + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0) / Math.max(1, v.right - v.left - SIZE), 0, 1),
            y: clamp(p.y + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0) / Math.max(1, v.bottom - v.top - SIZE), 0, 1),
        });
    });
    const closeOutside = event => { if (open && !root.contains(event.target)) setOpen(false); };
    listen(document, 'pointerdown', closeOutside);
    listen(document, 'click', closeOutside);
    listen(document, 'focusin', closeOutside);
    listen(document, 'keydown', event => {
        if (event.key === 'Escape' && open) {
            setOpen(false, { restoreFocus: true });
            event.preventDefault();
        }
    });
    const onResize = () => {
        if (drag) finishDrag({ pointerId: drag.id }, true);
        positionAnimation?.cancel();
        layout();
    };
    listen(window, 'resize', onResize);
    if (window.visualViewport) {
        listen(window.visualViewport, 'resize', onResize);
        listen(window.visualViewport, 'scroll', onResize);
    }
    listen(reducedMotion, 'change', () => {
        panelAnimation?.finish();
        positionAnimation?.cancel();
    });
    const observer = new ResizeObserver(layout);
    observer.observe(panel);
    layout();
    return { trigger, destroy() {
        destroyed = true;
        panelAnimation?.cancel();
        positionAnimation?.cancel();
        observer.disconnect();
        cleanups.forEach(cleanup => cleanup());
        root.remove();
    } };
}
