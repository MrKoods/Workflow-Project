import type { ChatEvent } from '../../orchestrator/types';
import { h } from './dom';

const MAX_ENTRIES = 60;

// Chat with the companion, under the orb. Replies stream in from the main
// process as ChatEvents; confirmations render inline with Confirm / Decline.
export function createChat(on: {
  send: (text: string) => void;
  answer: (id: string, ok: boolean) => void;
}) {
  const log = h('div', {
    class: 'chat-log',
    attrs: { role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation' },
  });
  const input = h('input', {
    class: 'field chat-input',
    attrs: {
      maxlength: '8000',
      autocomplete: 'off',
      placeholder: 'Talk to your companion…',
      'aria-label': 'Message the companion',
    },
  });
  const form = h('form', { class: 'chat-form' }, [
    input,
    h('button', { class: 'btn-link', text: 'Send', attrs: { type: 'submit' } }),
  ]);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    on.send(input.value);
    input.value = '';
  });

  let streaming: HTMLElement | null = null;
  const stickToBottom = () => (log.scrollTop = log.scrollHeight);
  const add = (role: string, text: string) => {
    const el = h('div', {
      class: 'chat-msg',
      text,
      attrs: { 'data-role': role },
    });
    log.append(el);
    while (log.childElementCount > MAX_ENTRIES) log.firstElementChild!.remove();
    stickToBottom();
    return el;
  };

  return {
    el: h('div', { class: 'chat' }, [log, form]),
    focus: () => input.focus(),
    get started() {
      return log.childElementCount > 0;
    },
    handle(e: ChatEvent) {
      switch (e.type) {
        case 'user':
          streaming = null;
          add('user', e.text);
          break;
        case 'delta':
          streaming ??= add('assistant', '');
          streaming.textContent += e.text;
          stickToBottom();
          break;
        case 'action':
          streaming = null;
          add('action', e.text);
          break;
        case 'confirm': {
          streaming = null;
          const el = add('confirm', e.text);
          el.dataset.confirmId = e.id;
          const choose = (ok: boolean) => () => on.answer(e.id, ok);
          el.append(
            h('span', { class: 'confirm-row' }, [
              h('button', {
                class: 'btn-link',
                text: 'Confirm',
                on: { click: choose(true) },
              }),
              h('button', {
                class: 'btn-link',
                text: 'Decline',
                on: { click: choose(false) },
              }),
            ]),
          );
          el.querySelector('button')?.focus();
          break;
        }
        case 'confirmed': {
          const el = log.querySelector<HTMLElement>(
            `[data-confirm-id="${e.id}"]`,
          );
          el?.querySelector('.confirm-row')?.remove();
          el?.append(e.ok ? ' Confirmed.' : ' Declined.');
          break;
        }
        case 'error':
          streaming = null;
          add('error', e.text);
          break;
        case 'done':
          streaming = null;
          break;
      }
    },
  };
}
