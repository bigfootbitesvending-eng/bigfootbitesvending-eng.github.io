/* ============================================================
   Bigfoot Bites: the one message line every page uses.
   Load it after /shared/config.js and before the page's own script.
   A success fades after 5 seconds. An error stays until dismissed.
   A working message ("Saving…") stays until the next message.

     BBMessages.show('success', 'Saved.');
     BBMessages.show('error', 'Nothing changed.', { why: 'Failed to fetch' });
     BBMessages.show('success', 'Done.', { action: 'Undo', onHide: fn });
     BBMessages.hide();
     setStatus('Could not save — Failed to fetch', true);

   setStatus(message, isError) is the short form the table tools use.
   "Could not save — Failed to fetch" becomes plain words, then the
   technical reason small and in italics.
   ============================================================ */
(function () {
  var STATUS_MS = 5000;
  var timer = null;
  var onHide = null;

  var line = document.createElement('div');
  line.id = 'bb-message';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  line.hidden = true;

  var text = document.createElement('span');
  text.id = 'bb-message-text';
  line.appendChild(text);

  var action = document.createElement('button');
  action.id = 'bb-message-action';
  action.type = 'button';
  action.hidden = true;
  line.appendChild(action);

  var dismiss = document.createElement('button');
  dismiss.id = 'bb-message-dismiss';
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  dismiss.hidden = true;
  line.appendChild(dismiss);

  // The top of the page: before a page-level header, else first in main, else first in the container.
  var topHeader = document.querySelector('body > header');
  if (topHeader) {
    topHeader.parentNode.insertBefore(line, topHeader);
  } else {
    var host = document.querySelector('main') || document.querySelector('.container') || document.body;
    host.insertBefore(line, host.firstChild);
  }

  function hide() {
    clearTimeout(timer);
    line.hidden = true;
    action.hidden = true;
    dismiss.hidden = true;
    text.textContent = '';
    line.removeAttribute('data-kind');
    var fn = onHide;
    onHide = null;
    if (fn) fn();
  }

  // Someone using the keyboard may be about to press a button in the line: wait another 5 seconds.
  // A tap or a click doesn't count, so a phone's message never gets stuck.
  function hideWhenIdle() {
    var keyboardInside = false;
    try { keyboardInside = !!line.querySelector(':focus-visible'); } catch (e) { keyboardInside = false; }
    if (keyboardInside) { timer = setTimeout(hideWhenIdle, STATUS_MS); return; }
    hide();
  }

  // kind: 'success', 'error' or 'working'.
  function show(kind, message, opts) {
    opts = opts || {};
    clearTimeout(timer); // a newer message restarts the clock
    text.textContent = message;
    if (opts.why) {
      var why = document.createElement('em');
      why.textContent = '(' + opts.why + ')';
      text.appendChild(document.createTextNode(' '));
      text.appendChild(why);
    }
    line.setAttribute('data-kind', kind);
    action.textContent = opts.action || '';
    action.hidden = !opts.action;
    dismiss.hidden = kind === 'working';
    line.hidden = false;
    onHide = opts.onHide || null;
    if (kind === 'success') timer = setTimeout(hideWhenIdle, STATUS_MS);
  }

  dismiss.addEventListener('click', hide);

  window.BBMessages = { show: show, hide: hide };

  window.setStatus = function (message, isError) {
    if (!message) { hide(); return; }
    var words = String(message);
    if (!isError) { show(/…$/.test(words) ? 'working' : 'success', words); return; }
    var cut = words.indexOf(' — ');
    if (cut < 0) { show('error', words); return; }
    var plain = words.slice(0, cut);
    plain = /^Could not load/.test(plain) ? plain + '. Reload the page to try again.' : 'Nothing changed. ' + plain + '.';
    show('error', plain, { why: words.slice(cut + 3) });
  };
})();
