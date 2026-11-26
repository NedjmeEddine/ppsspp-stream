/**
 * Non-overlapping PSP button bitmask (matches Core/HLE/sceCtrl.h).
 */
export const PSP_BUTTONS = Object.freeze({
    SELECT:   0x000001,
    START:    0x000008,
    UP:       0x000010,
    RIGHT:    0x000020,
    DOWN:     0x000040,
    LEFT:     0x000080,
    L:        0x000100,
    R:        0x000200,
    TRIANGLE: 0x001000,
    CIRCLE:   0x002000,
    CROSS:    0x004000,
    SQUARE:   0x008000,
    HOME:     0x010000,
});

const KEY_CODE_TO_BUTTON = Object.freeze({
    Backspace: PSP_BUTTONS.SELECT,
    ShiftRight: PSP_BUTTONS.SELECT,
    Enter: PSP_BUTTONS.START,
    Space: PSP_BUTTONS.START,
    ArrowUp: PSP_BUTTONS.UP,
    ArrowRight: PSP_BUTTONS.RIGHT,
    ArrowDown: PSP_BUTTONS.DOWN,
    ArrowLeft: PSP_BUTTONS.LEFT,
    KeyQ: PSP_BUTTONS.L,
    KeyE: PSP_BUTTONS.R,
    KeyW: PSP_BUTTONS.R,
    KeyS: PSP_BUTTONS.TRIANGLE,
    KeyX: PSP_BUTTONS.CIRCLE,
    KeyZ: PSP_BUTTONS.CROSS,
    KeyA: PSP_BUTTONS.SQUARE,
    Escape: PSP_BUTTONS.HOME,
});

const GAMEPAD_BTN_TO_PSP = [
    [0, PSP_BUTTONS.CROSS],
    [1, PSP_BUTTONS.CIRCLE],
    [2, PSP_BUTTONS.SQUARE],
    [3, PSP_BUTTONS.TRIANGLE],
    [4, PSP_BUTTONS.L],
    [5, PSP_BUTTONS.R],
    [8, PSP_BUTTONS.SELECT],
    [9, PSP_BUTTONS.START],
    [12, PSP_BUTTONS.UP],
    [13, PSP_BUTTONS.DOWN],
    [14, PSP_BUTTONS.LEFT],
    [15, PSP_BUTTONS.RIGHT],
    [16, PSP_BUTTONS.HOME],
];

const DEADZONE = 0.15;

function axisToByte(raw, deadzone = DEADZONE) {
    if (typeof raw !== 'number' || Number.isNaN(raw)) return 128;
    const abs = Math.abs(raw);
    if (abs < deadzone) return 128;
    const norm = Math.max(-1, Math.min(1, Math.sign(raw) * ((abs - deadzone) / (1 - deadzone))));
    if (norm < 0) return Math.max(0, Math.round(128 + norm * 128));
    return Math.min(255, Math.round(128 + norm * 127));
}

/**
 * Keyboard + Gamepad input bridge pushing non-overlapping PSP bitmasks & 0..255 analog axes.
 */
export function createInputBridge({ target = globalThis.window, getModule, onInput } = {}) {
    if (!target || typeof target.addEventListener !== 'function') {
        throw new Error('createInputBridge requires an EventTarget');
    }

    const ac = new AbortController();
    const { signal } = ac;
    const heldCodes = new Set();

    let destroyed = false;
    let state = { buttons: 0, lx: 128, ly: 128 };
    let lastPushedButtons = -1;
    let lastPushedLx = -1;
    let lastPushedLy = -1;

    function pushState(buttons, lx, ly, force = false) {
        state = { buttons: buttons >>> 0, lx: lx & 0xff, ly: ly & 0xff };
        const changed =
            state.buttons !== lastPushedButtons ||
            state.lx !== lastPushedLx ||
            state.ly !== lastPushedLy;
        if (!force && !changed) return;

        lastPushedButtons = state.buttons;
        lastPushedLx = state.lx;
        lastPushedLy = state.ly;

        if (typeof onInput === 'function') {
            onInput(state.buttons, state.lx, state.ly);
        }
        const mod = typeof getModule === 'function' ? getModule() : null;
        if (mod && typeof mod._ppsspp_stream_set_input === 'function') {
            mod._ppsspp_stream_set_input(state.buttons, state.lx, state.ly);
        }
    }

    function computeState() {
        let buttons = 0;
        for (const code of heldCodes) {
            const bit = KEY_CODE_TO_BUTTON[code];
            if (bit) buttons |= bit;
        }

        let lx = 128;
        let ly = 128;
        if (heldCodes.has('KeyJ') && !heldCodes.has('KeyL')) lx = 0;
        else if (heldCodes.has('KeyL') && !heldCodes.has('KeyJ')) lx = 255;

        if (heldCodes.has('KeyI') && !heldCodes.has('KeyK')) ly = 0;
        else if (heldCodes.has('KeyK') && !heldCodes.has('KeyI')) ly = 255;

        const pads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
            ? navigator.getGamepads()
            : null;
        if (pads) {
            for (const gp of pads) {
                if (!gp || gp.connected === false) continue;
                if (Array.isArray(gp.buttons)) {
                    for (const [idx, mask] of GAMEPAD_BTN_TO_PSP) {
                        if (gp.buttons[idx]?.pressed) buttons |= mask;
                    }
                }
                if (Array.isArray(gp.axes)) {
                    const gx = axisToByte(gp.axes[0]);
                    const gy = axisToByte(gp.axes[1]);
                    if (gx !== 128) lx = gx;
                    if (gy !== 128) ly = gy;
                }
                break;
            }
        }

        return { buttons: buttons >>> 0, lx, ly };
    }

    function poll() {
        if (destroyed) return;
        const next = computeState();
        pushState(next.buttons, next.lx, next.ly);
    }

    function clearAndReset() {
        heldCodes.clear();
        pushState(0, 128, 128);
    }

    target.addEventListener('keydown', (e) => {
        if (destroyed || !e?.code) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (KEY_CODE_TO_BUTTON[e.code] || e.code === 'KeyI' || e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'KeyL') {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            heldCodes.add(e.code);
            poll();
        }
    }, { signal });

    target.addEventListener('keyup', (e) => {
        if (destroyed || !e?.code) return;
        if (heldCodes.delete(e.code)) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            poll();
        }
    }, { signal });

    target.addEventListener('blur', () => {
        if (!destroyed) clearAndReset();
    }, { signal });

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (!destroyed && document.visibilityState === 'hidden') {
                clearAndReset();
            }
        }, { signal });
    }

    pushState(0, 128, 128, true);

    return {
        poll,
        getState() {
            return { ...state };
        },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            ac.abort();
            clearAndReset();
        },
    };
}
