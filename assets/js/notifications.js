let notificationFilter = 'all';

function render() {
  document.querySelectorAll('[data-notification-list]').forEach(container => {
    let notifications = Gather.state.notifications.slice().sort(Gather.byNewest);
    if (notificationFilter === 'requests') notifications = notifications.filter(item => item.type === 'friend-request');
    if (notificationFilter === 'mentions') notifications = notifications.filter(item => item.type === 'comment');
    container.innerHTML = notifications.map(item => {
      const actor = Gather.userById(item.actorId);
      const pending = item.type === 'friend-request' && item.status === 'pending';
      const label = item.type === 'friend-request' ? 'sent you a friend request.' : item.type === 'like' ? 'liked your post.' : 'replied to your post.';
      const icon = item.type === 'friend-request' ? '＋' : item.type === 'like' ? '♥' : '↩';
      const detail = item.detail ? `<span class="notification-detail">"${Gather.escapeHTML(item.detail)}"</span>` : '';
      const actions = pending ? `<div class="notification-actions"><button class="button button-primary" data-action="accept-request" data-notification-id="${Gather.escapeHTML(item.id)}">Accept</button><button class="button button-secondary" data-action="decline-request" data-notification-id="${Gather.escapeHTML(item.id)}">Decline</button></div>` : '';
      return `<article class="notification-row ${item.read ? '' : 'unread'}"><div class="notification-avatar">${Gather.avatar(actor)}<span class="notification-icon ${item.type === 'friend-request' ? 'friend' : item.type === 'comment' ? 'reply' : ''}">${icon}</span></div><div class="notification-content"><strong>${Gather.escapeHTML(actor.name)}</strong> ${label}${detail}${actions}</div><time class="notification-time">${Gather.prettyTime(item.createdAt)}</time></article>`;
    }).join('');
    document.querySelector('[data-empty-notifications]')?.classList.toggle('hidden', notifications.length > 0);
  });
}

Gather.start({
  render,
  bind() {
    const applyFilter = () => {
      document.querySelectorAll('[data-notification-filter]').forEach(item => item.classList.toggle('active', item.dataset.notificationFilter === notificationFilter));
      document.querySelectorAll('[data-notification-list] .notification-row').forEach(row => {
        const type = row.dataset.type;
        row.hidden = notificationFilter === 'requests' ? type !== 'friend-request' : notificationFilter === 'mentions' ? type !== 'comment' : false;
      });
    };
    applyFilter();
    document.querySelectorAll('[data-notification-filter]').forEach(tab => {
      tab.addEventListener('click', () => {
        notificationFilter = tab.dataset.notificationFilter;
        applyFilter();
      });
    });
  }
});
