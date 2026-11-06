/* ============================================================
   Bigfoot Bites: the Restock Run pages. The button names its own workflow:
     <button id="trigger-btn" data-webhook="...">Run Now</button>
   Load after /shared/config.js.
   ============================================================ */
(function () {
  var btn = document.getElementById('trigger-btn');
  var statusLine = document.getElementById('status-line');
  var webhook = btn.getAttribute('data-webhook');

  function setStatus(html, cls) {
    statusLine.className = cls || '';
    statusLine.innerHTML = html;
  }

  function formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function box(text) {
    var div = document.createElement('div');
    div.className = 'result-box error-box';
    div.textContent = text;
    return div.outerHTML;
  }

  btn.addEventListener('click', function () {
    btn.disabled = true;
    setStatus('<span class="spinner"></span>Running — this can take up to 2 minutes. Leave this page open.', 'pending');

    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
      body: JSON.stringify({})
    })
      .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
      .then(function (r) {
        if (r.ok) {
          setStatus(
            'Run complete.' +
            '<div class="result-box">' +
              '<div class="result-row"><span>Triggered</span><span>' + formatTime(r.body.triggered_at) + '</span></div>' +
              '<div class="result-row"><span>Completed</span><span>' + formatTime(r.body.completed_at) + '</span></div>' +
            '</div>',
            'success'
          );
        } else {
          setStatus('Run failed.' + box(JSON.stringify(r.body)), 'error');
        }
      })
      .catch(function (err) {
        setStatus('Run failed — request error.' + box(err.message), 'error');
      })
      .finally(function () { btn.disabled = false; });
  });
})();
