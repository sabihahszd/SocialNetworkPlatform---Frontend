function showProfilePhoto(photo) {
  const avatar = document.querySelector('[data-profile-avatar]');
  if (!avatar || !photo) return;
  avatar.innerHTML = `<img src="${Gather.escapeHTML(photo)}" alt="">`;
}

function showBanner(photo) {
  const cover = document.querySelector('.profile-cover');
  if (!cover || !photo) return;
  cover.style.backgroundImage = `linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url("${photo.replace(/"/g, '')}")`;
}

function fillEditor(user) {
  const editor = document.querySelector('[data-edit-modal]');
  if (!editor || editor.open) return;
  editor.querySelector('[name="name"]').value = user.name;
  editor.querySelector('[name="bio"]').value = user.bio || '';
  editor.querySelector('[name="location"]').value = user.location || '';
  const preview = editor.querySelector('[data-avatar-preview]');
  if (preview) {
    preview.hidden = !user.photo;
    if (user.photo) preview.src = Gather.safePhoto(user.photo);
  }
}

function renderFeeds() {
  document.querySelectorAll('[data-profile-feed]').forEach(container => {
    const feedType = container.dataset.profileFeed;
    const posts = Gather.state.posts.filter(post => Gather.canSee(post) && (
      feedType === 'replies'
        ? Gather.commentByAuthor(post.comments, Gather.state.currentUserId)
        : feedType === 'reposts'
          ? post.reposts.includes(Gather.state.currentUserId)
          : post.likes.includes(Gather.state.currentUserId)
    )).sort(Gather.byNewest);
    container.innerHTML = posts.map(post => Gather.renderPost(post)).join('');
    document.querySelector(`[data-profile-empty="${feedType}"]`)?.classList.toggle('hidden', posts.length > 0);
  });
  const ownPosts = Gather.state.posts.filter(post => Gather.canSee(post) && post.authorId === Gather.state.currentUserId).sort(Gather.byNewest);
  document.querySelectorAll('.profile-content [data-feed-list]').forEach(container => {
    container.innerHTML = ownPosts.map(post => Gather.renderPost(post)).join('');
  });
  const counted = Gather.state.posts.filter(post => post.authorId === Gather.state.currentUserId);
  document.querySelectorAll('[data-profile-post-count]').forEach(node => {
    node.textContent = `${counted.length} ${counted.length === 1 ? 'post' : 'posts'}`;
  });
}

function render() {
  const user = Gather.currentUser();
  if (!user) return;
  document.querySelectorAll('[data-profile-name], [data-profile-full-name]').forEach(node => { node.textContent = user.name; });
  document.querySelectorAll('[data-profile-handle]').forEach(node => { node.textContent = `@${user.username}`; });
  document.querySelectorAll('[data-profile-bio]').forEach(node => { node.textContent = user.bio || ''; });
  const photoNode = document.querySelector('[data-profile-avatar]');
  if (photoNode) photoNode.innerHTML = user.photo ? `<img src="${Gather.escapeHTML(Gather.safePhoto(user.photo))}" alt="${Gather.escapeHTML(user.name)}">` : Gather.escapeHTML(user.name.slice(0, 1).toUpperCase());
  const cover = document.querySelector('.profile-cover');
  if (cover) cover.style.backgroundImage = user.banner ? `linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url("${Gather.safePhoto(user.banner)}")` : '';
  document.querySelectorAll('[data-profile-location]').forEach(node => { node.textContent = user.location ? `⌖ ${user.location}` : '⌖ Add a location'; });
  document.querySelectorAll('[data-following-total]').forEach(node => { node.textContent = Gather.state.following.length; });
  document.querySelectorAll('[data-followers-total]').forEach(node => { node.textContent = Gather.state.followers.length; });
  document.querySelectorAll('[data-friends-total]').forEach(node => { node.textContent = Gather.state.friends.length; });
  document.title = `${user.name} — Gather`;
  fillEditor(user);
  renderFeeds();
}

function connectionIds(kind) {
  if (kind === 'friends') return Gather.state.friends;
  if (kind === 'followers') return Gather.state.followers;
  return Gather.state.following;
}

function renderConnectionList(kind) {
  const dialog = document.querySelector('[data-connections-modal]');
  if (!dialog) return;
  const titles = { following: 'Following', followers: 'Followers', friends: 'Friends' };
  dialog.querySelector('[data-connections-title]').textContent = titles[kind] || 'People';
  dialog.querySelectorAll('.connection-tabs [data-connection]').forEach(tab => tab.classList.toggle('active', tab.dataset.connection === kind));
  const people = connectionIds(kind).map(Gather.userById).filter(user => user?.id && user.id !== 'someone');
  dialog.querySelector('[data-connection-list]').innerHTML = people.map(user => `<article class="friend-row">${Gather.avatar(user)}<div><strong>${Gather.escapeHTML(user.name)}</strong><span>@${Gather.escapeHTML(user.username)}</span></div><div class="friend-row-actions"><button class="icon-button" type="button" data-action="user-options" data-user-name="${Gather.escapeHTML(user.name)}" data-handle="@${Gather.escapeHTML(user.username)}" aria-label="Profile options">···</button></div></article>`).join('') || '<p class="empty-hint">No one here yet.</p>';
}

function ensureUserOptions() {
  if (document.querySelector('[data-user-options-modal]')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'gather-action-dialog';
  dialog.dataset.userOptionsModal = '';
  dialog.innerHTML = '<div class="gather-action-content"><button class="modal-close" type="button" data-action="close-dialog" aria-label="Close">×</button><h2>Profile options</h2><div class="gather-action-options"><button class="button button-secondary" type="button" data-action="block-user">Block</button><button class="button button-secondary" type="button" data-action="report-user">Report</button></div></div>';
  document.body.append(dialog);
}

function ensureProfileReport() {
  if (document.querySelector('[data-profile-report-modal]')) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.dataset.profileReportModal = '';
  dialog.innerHTML = '<div class="modal-content"><button class="modal-close" type="button" data-action="close-dialog" aria-label="Close">×</button><h2>Report this profile</h2><p class="modal-copy">Reports are private and reviewed by a moderator.</p><label class="field-label">What is the concern?<select><option>Spam or misleading content</option><option>Harassment or bullying</option><option>Hateful or harmful content</option><option>Something else</option></select></label><button class="button button-primary" type="button" data-action="submit-profile-report">Send report</button></div>';
  document.body.append(dialog);
}

Gather.start({
  render,
  bind() {
    document.querySelectorAll('[data-profile-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-profile-tab]').forEach(item => item.classList.toggle('active', item === tab));
        document.querySelectorAll('[data-profile-content]').forEach(section => section.classList.toggle('hidden', section.dataset.profileContent !== tab.dataset.profileTab));
      });
    });
    document.querySelector('[data-avatar-file]')?.addEventListener('change', async event => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const photo = await Gather.readPhotoFile(file);
        showProfilePhoto(photo);
      } catch {
        return;
      }
    });
    document.querySelector('[data-banner-file]')?.addEventListener('change', async event => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      const notice = input.closest('form')?.querySelector('[data-banner-notice]');
      if (!file) return;
      try {
        const photo = await Gather.readPhotoFile(file);
        showBanner(photo);
        if (notice) notice.textContent = '';
      } catch (error) {
        input.value = '';
        if (notice) notice.textContent = error.message;
      }
    });
  },
  async action(name, element, event) {
    if (name === 'show-connections') {
      const kind = element.dataset.connection || 'following';
      const dialog = document.querySelector('[data-connections-modal]');
      if (!dialog) return;
      renderConnectionList(kind);
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (name === 'toggle-follow') {
      return;
    }
    if (name === 'user-options') {
      ensureUserOptions();
      const dialog = document.querySelector('[data-user-options-modal]');
      dialog.dataset.userName = element.dataset.userName || '';
      dialog.dataset.handle = element.dataset.handle || '';
      dialog.showModal();
      return;
    }
    if (name === 'block-user') {
      const dialog = document.querySelector('[data-user-options-modal]');
      const handle = dialog?.dataset.handle;
      if (handle) {
        document.querySelectorAll('[data-connection-list] .friend-row').forEach(row => {
          if (row.querySelector(`[data-handle="${handle}"]`)) row.remove();
        });
      }
      dialog?.close();
      return;
    }
    if (name === 'report-user') {
      document.querySelector('[data-user-options-modal]')?.close();
      ensureProfileReport();
      document.querySelector('[data-profile-report-modal]')?.showModal();
      return;
    }
    if (name === 'submit-profile-report') {
      document.querySelector('[data-profile-report-modal]')?.close();
      return;
    }
    if (name === 'edit-profile') {
      const user = Gather.currentUser();
      if (user) fillEditor(user);
      document.querySelector('[data-edit-modal]')?.showModal();
      return;
    }
    if (name !== 'save-profile') return;
    event.preventDefault();
    const form = element.closest('form');
    if (!form) return;
    const photoInput = form.querySelector('[data-avatar-file]');
    const bannerInput = form.querySelector('[data-banner-file]');
    const photoNotice = form.querySelector('[data-photo-notice]');
    let photo = '';
    let banner = '';
    if (photoInput?.files?.[0]) {
      try { photo = await Gather.readPhotoFile(photoInput.files[0]); }
      catch (error) { if (photoNotice) photoNotice.textContent = error.message; return; }
    }
    if (bannerInput?.files?.[0]) {
      try { banner = await Gather.readPhotoFile(bannerInput.files[0]); }
      catch (error) {
        const notice = form.querySelector('[data-banner-notice]');
        if (notice) notice.textContent = error.message;
        return;
      }
    }
    form.closest('dialog')?.close();
  }
});
