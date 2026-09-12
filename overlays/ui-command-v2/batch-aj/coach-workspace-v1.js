/* Approved Coach workspace. Move native controls; never replace their handlers,
   infer training advice, or write athlete/session data. */
(() => {
  'use strict';
  const icons = {
    plan: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m3 0h2"/>',
    exercise: '<path d="M3 9v6m4-9v12m10-12v12m4-9v6M7 12h10"/>',
    load: '<path d="M5 20V12m7 8V4m7 16V8"/>',
    swap: '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
    why: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
    send: '<path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15"/>',
  };
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
  const prompts = {
    'What are we doing today?': ['Today’s plan', 'plan'],
    'What should I focus on?': ['Exercise cues', 'exercise'],
    'Can I increase the weight?': ['Weight guidance', 'load'],
    'Give me a substitute.': ['Substitutions', 'swap'],
    'What did I do last time?': ['Last workout', 'time'],
    'Why am I doing this?': ['Why this exercise?', 'why'],
  };
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function move(node, parent) {
    if (node && node.parentNode !== parent) parent.append(node);
  }
  function mount() {
    const shell = document.querySelector('.coach-shell');
    document.body.classList.toggle('lmf-coach-workspace-active', Boolean(shell));
    if (!shell) return;
    const chat = shell.querySelector('.coach-chat');
    const answer = shell.querySelector('#coach-answer');
    const quick = shell.querySelector('.quick-prompts');
    const composer = shell.querySelector('.coach-composer');
    if (!chat || !answer || !quick || !composer) return;
    if (!shell.classList.contains('lmf-coach-workspace')) {
      shell.classList.add('lmf-coach-workspace');
      const title = shell.querySelector('.coach-banner h1');
      if (title) title.innerHTML = 'LETMEFLY <span>COACH</span>';
      const conversation = element('section', 'lmf-coach-conversation');
      conversation.setAttribute('aria-label', 'Your conversation');
      const heading = element('h2', 'lmf-coach-conversation-heading', 'Your conversation');
      const thread = element('div', 'lmf-coach-thread');
      const question = element('div', 'lmf-coach-question');
      question.hidden = true;
      thread.append(question, answer);
      answer.setAttribute('aria-live', 'polite');
      answer.setAttribute('aria-atomic', 'true');
      quick.setAttribute('aria-label', 'Quick actions');
      for (const [prompt, [label, glyph]] of Object.entries(prompts)) {
        const button = [...quick.children].find(node => node.getAttribute('data-coach-prompt') === prompt);
        if (!button) continue;
        button.innerHTML = `${icon(glyph)}<span>${label}</span>`;
        button.title = prompt;
        quick.append(button);
      }
      const input = composer.querySelector('#coach-question');
      if (input) {
        input.placeholder = 'Ask your coach…';
        input.setAttribute('aria-label', 'Ask your coach');
        input.rows = 2;
      }
      const send = composer.querySelector('[data-action="ask-coach"]');
      if (send) {
        send.innerHTML = icon('send');
        send.setAttribute('aria-label', 'Send question');
        send.title = 'Send question (Ctrl or ⌘ + Enter)';
      }
      conversation.append(heading, quick, thread, composer);
      const sidebar = element('aside', 'lmf-coach-sidebar');
      sidebar.setAttribute('aria-label', 'Your coaching context');
      chat.append(conversation, sidebar);
      const context = shell.querySelector('.coach-context');
      if (context) {
        const kicker = context.querySelector('.page-kicker');
        if (kicker) kicker.textContent = 'TODAY’S FOCUS';
        const guidance = element('details', 'lmf-coach-session-guidance');
        guidance.append(element('summary', '', 'Session guidance'));
        const grid = context.querySelector('.context-grid');
        for (const field of grid?.children || []) {
          const key = field.querySelector('span')?.textContent.trim().toLowerCase();
          if (['program', 'position', 'session', 'priority'].includes(key)) field.dataset.coachField = key;
        }
        move(context.querySelector('[data-coach-field="priority"]'), guidance);
        move(context.querySelector(':scope > p'), guidance);
        const workout = element('a', 'lmf-coach-workout-link', '›');
        workout.href = '#/train';
        workout.setAttribute('aria-label', 'View today’s workout');
        context.append(workout, guidance);
        move(context, sidebar);
      }
    }
    // Both asynchronous enhancements retain .coach-chat as their refresh host.
    // Moving them within it preserves selectors, listeners and selected values.
    const sidebar = chat.querySelector('.lmf-coach-sidebar');
    const exercise = chat.querySelector('#lmf-coach-intelligence-context');
    if (exercise && exercise.parentNode !== sidebar) {
      const label = exercise.querySelector('label');
      if (label) label.textContent = 'Exercise focus';
      move(exercise, sidebar);
    }
    const insights = chat.querySelector('#lmf-athlete-coach');
    move(insights, sidebar);
    move(chat.querySelector('.lmf-ai-unavailable'), sidebar);
    if (exercise && insights && exercise.nextElementSibling !== insights) sidebar.insertBefore(exercise, insights);
  }
  function showQuestion(value) {
    const question = document.querySelector('.lmf-coach-question');
    if (!question || !value.trim()) return;
    const label = element('span', 'lmf-coach-question-label', 'You');
    const copy = element('p', '', value.trim());
    question.replaceChildren(label, copy);
    question.hidden = false;
  }
  // Window capture runs before the existing document-level exercise interceptors.
  // This only displays the actual submitted question; those handlers own answers.
  window.addEventListener('click', event => {
    const control = event.target.closest?.('.coach-shell [data-coach-prompt], .coach-shell [data-action="ask-coach"]');
    if (!control || control.disabled) return;
    showQuestion(control.getAttribute('data-coach-prompt') || document.querySelector('#coach-question')?.value || '');
  }, true);
  window.addEventListener('keydown', event => {
    if (event.target?.id === 'coach-question' && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) showQuestion(event.target.value || '');
  }, true);
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; mount(); });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', schedule);
  mount();
})();
