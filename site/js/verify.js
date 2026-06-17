(function () {
  var API_BASE = 'https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
  var app = document.getElementById('app');

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function getToken() {
    var params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  function showError(msg) {
    app.innerHTML = '<div class="state-error">' +
      '<h3>Unable to Load Verification</h3>' +
      '<p>' + esc(msg) + '</p>' +
      '</div>';
  }

  function showSuccess(msg, pending) {
    app.innerHTML = '<div class="state-success">' +
      '<div class="check">&#10003;</div>' +
      '<h3>' + (pending ? 'Application Submitted' : 'Verified') + '</h3>' +
      '<p>' + esc(msg) + '</p>' +
      (pending ? '<p class="pending-note">Staff will review your application. You will be notified in Discord.</p>' : '<p class="pending-note">You can now close this tab and return to Discord.</p>') +
      '</div>';
  }

  function renderForm(data, token) {
    var html = '<div class="verify-title">Server Verification</div>' +
      '<div class="verify-sub">Complete the form below to verify your membership.</div>' +
      '<div class="verify-guild">Verifying for: <strong>' + esc(data.guildName) + '</strong></div>' +
      '<form id="verify-form">' +
      '<div class="form-group">' +
      '<label class="form-label" for="psnxbox">PSN / Xbox Gamertag</label>' +
      '<input class="form-input" id="psnxbox" type="text" placeholder="Your PSN or Xbox username" required autocomplete="off">' +
      '</div>';

    if (data.questions && data.questions.length > 0) {
      data.questions.forEach(function (q, i) {
        html += '<div class="form-group">' +
          '<label class="form-label" for="q_' + i + '">' + esc(q) + '</label>' +
          '<textarea class="form-textarea" id="q_' + i + '" placeholder="Your answer..." required></textarea>' +
          '</div>';
      });
    }

    html += '<button type="submit" class="form-btn" id="submit-btn">Submit Verification</button>' +
      '<div id="form-msg"></div>' +
      '</form>';

    app.innerHTML = html;

    document.getElementById('verify-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('submit-btn');
      var msgEl = document.getElementById('form-msg');
      var psnxbox = document.getElementById('psnxbox').value.trim();

      if (!psnxbox) {
        msgEl.innerHTML = '<div class="msg error">PSN/Xbox username is required.</div>';
        return;
      }

      var answers = [];
      if (data.questions && data.questions.length > 0) {
        for (var i = 0; i < data.questions.length; i++) {
          var ans = document.getElementById('q_' + i).value.trim();
          if (!ans) {
            msgEl.innerHTML = '<div class="msg error">Please answer all questions.</div>';
            return;
          }
          answers.push(ans);
        }
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Submitting...';
      msgEl.innerHTML = '';

      fetch(API_BASE + '/api/verify/' + token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ psnxbox: psnxbox, answers: answers }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok && res.data.success) {
            showSuccess(res.data.message, res.data.pending);
          } else {
            btn.disabled = false;
            btn.innerHTML = 'Submit Verification';
            msgEl.innerHTML = '<div class="msg error">' + esc(res.data.error || 'Something went wrong.') + '</div>';
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.innerHTML = 'Submit Verification';
          msgEl.innerHTML = '<div class="msg error">Network error. Please try again.</div>';
        });
    });
  }

  var token = getToken();
  if (!token) {
    showError('No verification token found. Please click the Verify button in Discord to get a fresh link.');
    return;
  }

  fetch(API_BASE + '/api/verify/' + token)
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (res.ok && res.data.valid) {
        renderForm(res.data, token);
      } else {
        showError(res.data.error || 'Invalid verification link.');
      }
    })
    .catch(function () {
      showError('Failed to load verification form. Please try again.');
    });
})();
