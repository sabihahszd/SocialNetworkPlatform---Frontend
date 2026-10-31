function showNotice(panelId, message, isError = false) {
  const notice = document.querySelector(`[data-settings-notice="${panelId}"]`);
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle('is-error', isError);
  clearTimeout(notice._timer);
  notice._timer = setTimeout(() => {
    notice.textContent = '';
    notice.classList.remove('is-error');
  }, 3500);
}

function renderBlockedList() {
  const list = document.querySelector('[data-blocked-list]');
  const empty = document.querySelector('[data-blocked-empty]');
  if (!list) return;
  const blocked = (Gather.appSettings.blockedUserIds || []).map(id => Gather.state.users.find(user => user.id === id)).filter(Boolean);
  if (empty) empty.classList.toggle('hidden', blocked.length > 0);
  list.innerHTML = blocked.map(user => `<li class="blocked-item"><span class="avatar ${Gather.escapeHTML(user.tone || '')}">${user.photo ? `<img src="${Gather.escapeHTML(Gather.safePhoto(user.photo))}" alt="">` : Gather.escapeHTML(user.name.slice(0, 1).toUpperCase())}</span><div class="blocked-item-info"><strong>${Gather.escapeHTML(user.name)}</strong><span>@${Gather.escapeHTML(user.username)}</span></div><button class="button button-small button-secondary" type="button" data-action="unblock-user" data-user-id="${Gather.escapeHTML(user.id)}">Unblock</button></li>`).join('');
}

function render() {
  const user = Gather.currentUser();
  const account = document.querySelector('[data-settings-form="account"]');
  if (account && user && document.activeElement?.closest('[data-settings-form="account"]') !== account) {
    account.querySelector('[data-settings-name]').value = user.name || '';
    account.querySelector('[data-settings-username]').value = user.username || '';
    account.querySelector('[data-settings-location]').value = user.location || '';
    const emailField = account.querySelector('[data-settings-email]');
    if (emailField) emailField.value = user.email || '';
  }
  const privacy = document.querySelector('[data-settings-form="privacy"]');
  if (privacy && document.activeElement?.closest('[data-settings-form="privacy"]') !== privacy) {
    privacy.querySelector('[data-settings-default-privacy]').value = Gather.appSettings.defaultPrivacy;
    privacy.querySelector('[data-settings-allow-requests]').checked = Gather.appSettings.allowRequests;
    privacy.querySelector('[data-settings-show-suggestions]').checked = Gather.appSettings.showSuggestions;
    privacy.querySelector('[data-settings-allow-dms]').checked = Gather.appSettings.allowDms;
  }
  renderBlockedList();
  const notifications = document.querySelector('[data-settings-form="notifications-pref"]');
  if (notifications && document.activeElement?.closest('[data-settings-form="notifications-pref"]') !== notifications) {
    notifications.querySelector('[data-settings-notify-likes]').checked = Gather.appSettings.notifyLikes;
    notifications.querySelector('[data-settings-notify-replies]').checked = Gather.appSettings.notifyReplies;
    notifications.querySelector('[data-settings-notify-reposts]').checked = Gather.appSettings.notifyReposts;
    notifications.querySelector('[data-settings-notify-requests]').checked = Gather.appSettings.notifyRequests;
    notifications.querySelector('[data-settings-notify-communities]').checked = Gather.appSettings.notifyCommunities;
  }
  const appearance = document.querySelector('[data-settings-form="appearance"]');
  if (appearance && document.activeElement?.closest('[data-settings-form="appearance"]') !== appearance) {
    const themeRadio = appearance.querySelector(`[data-settings-theme][value="${Gather.appSettings.theme}"]`);
    if (themeRadio) themeRadio.checked = true;
    appearance.querySelector('[data-settings-reduce-motion]').checked = Gather.appSettings.reduceMotion;
    appearance.querySelector('[data-settings-autoplay]').checked = Gather.appSettings.autoplay;
  }
}

Gather.start({
  render,
  bind() {
    document.querySelectorAll('.settings-nav-item[data-settings-tab]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-item[data-settings-tab]').forEach(item => item.classList.toggle('active', item === button));
        document.querySelectorAll('.settings-panel[data-settings-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.settingsPanel !== button.dataset.settingsTab));
      });
    });
    const hash = window.location.hash.slice(1);
    if (['account', 'privacy', 'notifications-pref', 'appearance'].includes(hash)) {
      document.querySelector(`[data-settings-tab="${hash}"]`)?.click();
    }
  },
  async action(name, element) {
    if (name === 'delete-account') {
      document.querySelector('[data-delete-modal]')?.showModal();
      return;
    }
    if (name === 'close-delete-modal') {
      document.querySelector('[data-delete-modal]')?.close();
      return;
    }
    if (name === 'confirm-delete-account') {
      document.querySelector('[data-delete-modal]')?.close();
      return;
    }
    if (name === 'unblock-user') element.closest('.blocked-item')?.remove();
  },
  submit(event) {
    const form = event.target.closest('[data-settings-form]');
    if (!form) return;
    event.preventDefault();
    const id = form.dataset.settingsForm;
    if (id === 'account') {
      const password = form.elements.namedItem('password').value;
      const confirm = form.elements.namedItem('password-confirm').value;
      if (password && password !== confirm) showNotice('account', 'Passwords do not match.', true);
    }
  }
});
