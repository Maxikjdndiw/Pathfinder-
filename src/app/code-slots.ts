/**
 * Access code input as single slots (like verification codes). One field per character,
 * focus moves on by itself, Backspace goes back, arrows switch slots, pasting or phone
 * autofill fills all slots. The joined code (with the dash) goes into a hidden input, so the
 * login logic stays as it was.
 */

/** Characters in an access code, without the dash. Codes look like LENA-4821. */
export const CODE_SLOTS = 8;
/** A dash is shown (and sent) after this many characters; 0 for no dash. */
export const CODE_SPLIT = 4;

export type SlotState = 'idle' | 'checking' | 'error' | 'success';

export interface CodeSlots {
  /** the code as the server expects it, for example LENA-4821; '' while incomplete */
  value(): string;
  complete(): boolean;
  setState(state: SlotState): void;
  clear(): void;
  focus(): void;
  /** fills the slots, for example with a code that was just requested */
  setValue(code: string): void;
}

const clean = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function createCodeSlots(group: HTMLElement, hidden: HTMLInputElement, onComplete: () => void): CodeSlots {
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Zugangscode');
  group.classList.add('slots');
  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < CODE_SLOTS; i++) {
    if (CODE_SPLIT && i === CODE_SPLIT) {
      const dash = document.createElement('span');
      dash.className = 'slots__dash';
      dash.setAttribute('aria-hidden', 'true');
      group.append(dash);
    }
    const input = document.createElement('input');
    input.className = 'slot';
    input.type = 'text';
    input.inputMode = 'text';
    input.autocapitalize = 'characters';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
    // the first slot takes the phone's code suggestion, the others stay quiet
    input.autocomplete = i === 0 ? 'one-time-code' : 'off';
    input.maxLength = i === 0 ? CODE_SLOTS + 4 : 1;
    input.setAttribute('aria-label', `Zeichen ${i + 1} von ${CODE_SLOTS}`);
    group.append(input);
    inputs.push(input);
  }

  const raw = () => inputs.map((i) => i.value).join('');
  const sync = () => {
    const r = raw();
    hidden.value = r.length === CODE_SLOTS ? (CODE_SPLIT ? `${r.slice(0, CODE_SPLIT)}-${r.slice(CODE_SPLIT)}` : r) : '';
    inputs.forEach((i) => i.classList.toggle('is-filled', !!i.value));
  };
  /** writes characters from slot `from` on; returns the index after the last one */
  const fill = (from: number, chars: string) => {
    let k = from;
    for (const c of chars) {
      if (k >= CODE_SLOTS) break;
      inputs[k++].value = c;
    }
    return k;
  };
  /** check right away only when this change finished the code: the last slot was just filled,
   *  or a whole code arrived at once. Editing one slot of a full code waits for the button. */
  const after = (finished: boolean) => {
    sync();
    if (group.dataset.state === 'error') setState('idle');
    if (finished && raw().length === CODE_SLOTS) onComplete();
  };

  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      const chars = clean(input.value);
      if (!chars) {
        input.value = '';
        sync();
        return;
      }
      // after a wrong code, typing in the first slot starts a fresh code
      if (i === 0 && group.dataset.state === 'error') inputs.slice(1).forEach((x) => (x.value = ''));
      // several characters at once: autofill or a fast keyboard
      const next = chars.length > 1 ? fill(i, chars) : (input.value = chars.slice(-1), i + 1);
      inputs[Math.min(next, CODE_SLOTS - 1)].focus();
      after(next >= CODE_SLOTS);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        e.preventDefault();
        inputs[i - 1].value = '';
        inputs[i - 1].focus();
        sync();
      } else if (e.key === 'ArrowLeft' && i > 0) {
        e.preventDefault();
        inputs[i - 1].focus();
      } else if (e.key === 'ArrowRight' && i < CODE_SLOTS - 1) {
        e.preventDefault();
        inputs[i + 1].focus();
      }
    });
    input.addEventListener('paste', (e) => {
      const chars = clean(e.clipboardData?.getData('text') ?? '');
      if (!chars) return;
      e.preventDefault();
      // a whole code fills from the start, a piece from here
      const next = fill(chars.length >= CODE_SLOTS ? 0 : i, chars);
      inputs[Math.min(next, CODE_SLOTS - 1)].focus();
      after(next >= CODE_SLOTS);
    });
    input.addEventListener('focus', () => input.select());
  });

  function setState(state: SlotState) {
    group.dataset.state = state;
    inputs.forEach((i) => (i.readOnly = state === 'checking' || state === 'success'));
    if (state === 'error') group.setAttribute('aria-invalid', 'true');
    else group.removeAttribute('aria-invalid');
  }
  setState('idle');

  return {
    value: () => hidden.value,
    complete: () => raw().length === CODE_SLOTS,
    setState,
    clear() {
      inputs.forEach((i) => (i.value = ''));
      sync();
      setState('idle');
    },
    focus() {
      const first = inputs.find((i) => !i.value) ?? inputs[CODE_SLOTS - 1];
      first.focus();
    },
    setValue(code: string) {
      inputs.forEach((i) => (i.value = ''));
      fill(0, clean(code));
      sync();
      setState('idle');
    },
  };
}
