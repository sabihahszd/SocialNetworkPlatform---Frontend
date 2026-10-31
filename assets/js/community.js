let communityFeed = 'latest';
let directoryFilter = 'all';

function syncCommunityCompose(member) {
  const posting = communityFeed === 'latest' || communityFeed === 'popular';
  document.querySelectorAll('[data-community-compose]').forEach(section => {
    if (member !== undefined) section.dataset.member = member ? '1' : '0';
    section.classList.toggle('hidden', section.dataset.member === '0' || !posting);
  });
}

function selectedCommunity() {
  const id = new URLSearchParams(window.location.search).get('id');
  return Gather.state.communities.find(community => community.id === id) || Gather.state.communities[0];
}

function applyDirectoryView() {
  if (Gather.state.communities.length) {
    renderDirectory();
    return;
  }
  const query = document.querySelector('[data-community-search]')?.value.trim().toLowerCase() || '';
  document.querySelectorAll('[data-community-directory]').forEach(grid => {
    const cards = [...grid.querySelectorAll('.directory-card')];
    cards.forEach((card, index) => { if (!card.dataset.order) card.dataset.order = String(index); });
    const visible = cards.filter(card => {
      const joined = Boolean(card.querySelector('.directory-joined')) || /joined/i.test(card.querySelector('[data-action="toggle-community"]')?.textContent || '');
      const matchesQuery = card.textContent.toLowerCase().includes(query);
      const show = matchesQuery && (directoryFilter !== 'joined' || joined);
      card.classList.toggle('hidden', !show);
      return show;
    });
    const ordered = directoryFilter === 'popular'
      ? visible.sort((a, b) => (parseInt(b.querySelector('.directory-members')?.textContent, 10) || 0) - (parseInt(a.querySelector('.directory-members')?.textContent, 10) || 0))
      : visible.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
    ordered.forEach(card => grid.append(card));
    cards.filter(card => !ordered.includes(card)).forEach(card => grid.append(card));
    grid.parentElement?.querySelector('[data-community-directory-empty]')?.classList.toggle('hidden', ordered.length > 0);
  });
}

function renderDirectory() {
  const query = document.querySelector('[data-community-search]')?.value.trim().toLowerCase() || '';
  let circles = Gather.state.communities.filter(circle => `${circle.name} ${circle.description}`.toLowerCase().includes(query));
  if (directoryFilter === 'joined') circles = circles.filter(Gather.isCommunityMember);
  if (directoryFilter === 'popular') circles = circles.slice().sort((a, b) => b.members - a.members);
  document.querySelectorAll('[data-community-directory]').forEach(container => {
    container.innerHTML = circles.map(circle => `<article class="directory-card"><a class="directory-card-art" href="${Gather.communityUrl(circle.id)}" style="${circle.banner ? `background-image:linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url('${Gather.escapeHTML(circle.banner)}')` : `--community-color:${Gather.escapeHTML(circle.color)}`}" aria-label="Open ${Gather.escapeHTML(circle.name)}"></a><div class="directory-card-body"><a class="directory-card-title" href="${Gather.communityUrl(circle.id)}"><h2>${Gather.escapeHTML(circle.name)}</h2></a><p class="directory-card-description">${Gather.escapeHTML(circle.description)}</p><div class="directory-card-footer"><span class="directory-members">${Gather.memberCount(circle.members)} members</span>${Gather.isCommunityMember(circle) ? '<span class="directory-joined">✓ Joined</span>' : `<button class="button button-small button-primary" data-action="toggle-community" data-community-id="${Gather.escapeHTML(circle.id)}">Join</button>`}</div></div></article>`).join('');
  });
  document.querySelectorAll('[data-community-directory-empty]').forEach(empty => empty.classList.toggle('hidden', circles.length > 0));
  document.querySelectorAll('[data-community-filter]').forEach(button => button.classList.toggle('active', button.dataset.communityFilter === directoryFilter));
  const joined = Gather.state.communities.filter(Gather.isCommunityMember);
  document.querySelectorAll('[data-joined-community-list]').forEach(container => {
    container.innerHTML = joined.slice(0, 5).map(circle => `<a class="joined-circle-row" href="${Gather.communityUrl(circle.id)}"><span class="trend-stamp" style="--stamp:${Gather.escapeHTML(circle.color)}">${Gather.escapeHTML(circle.emoji)}</span><span class="joined-circle-row-copy"><strong>${Gather.escapeHTML(circle.name)}</strong><span>${Gather.memberCount(circle.members)} members</span></span></a>`).join('') || '<p class="subtle">You have not joined a community yet.</p>';
  });
  document.querySelectorAll('[data-joined-circle-count]').forEach(node => { node.textContent = `${joined.length} joined`; });
}

function renderMembers(community) {
  const memberUsers = (community.memberIds || []).map(Gather.userById).filter(user => user.active !== false);
  const renderMember = user => `<article class="community-member">${Gather.avatar(user)}<div class="community-member-info"><strong>${Gather.escapeHTML(user.name)}</strong><span>@${Gather.escapeHTML(user.username)}</span></div>${user.id === community.ownerId ? '<span class="member-badge">Creator</span>' : user.role === 'admin' ? '<span class="member-badge">Moderator</span>' : ''}</article>`;
  document.querySelectorAll('[data-community-member-list]').forEach(container => {
    container.innerHTML = memberUsers.map(renderMember).join('') || '<p class="empty-hint">Be the first to join this community.</p>';
  });
  document.querySelectorAll('[data-community-member-preview]').forEach(container => {
    container.innerHTML = memberUsers.slice(0, 4).map(user => `<div class="suggestion">${Gather.avatar(user)}<div class="suggestion-info"><strong>${Gather.escapeHTML(user.name)}</strong><span>@${Gather.escapeHTML(user.username)}</span></div></div>`).join('') || '<p class="subtle">No members yet.</p>';
  });
  document.querySelectorAll('[data-community-member-total]').forEach(node => { node.textContent = `${Gather.memberCount(community.members)} members`; });
}

function renderDetail() {
  const directory = document.querySelector('[data-community-index]');
  const detail = document.querySelector('[data-community-detail]');
  const selectedId = new URLSearchParams(window.location.search).get('id');
  if (directory) {
    const showDirectory = !selectedId;
    directory.classList.toggle('hidden', !showDirectory);
    if (detail) detail.classList.toggle('hidden', showDirectory);
    document.body.classList.toggle('community-index-mode', showDirectory);
    if (showDirectory) {
      document.title = 'Community — Gather';
      return;
    }
  }
  const community = selectedCommunity();
  if (!community || !document.querySelector('[data-community-hero]')) return;
  document.title = `${community.name} — Gather`;
  document.querySelectorAll('[data-community-name], [data-community-title], [data-about-community-title]').forEach(node => { node.textContent = community.name; });
  document.querySelectorAll('[data-community-description], [data-community-about-description], [data-community-side-description]').forEach(node => { node.textContent = community.description; });
  document.querySelectorAll('[data-community-art]').forEach(node => {
    node.style.setProperty('--community-color', community.color);
    node.style.backgroundImage = community.banner ? `linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url("${community.banner.replace(/"/g, '')}")` : '';
  });
  document.querySelectorAll('[data-community-members], [data-community-side-members]').forEach(node => { node.textContent = Gather.memberCount(community.members); });
  document.querySelectorAll('[data-community-owner]').forEach(node => { node.textContent = Gather.userById(community.ownerId).name; });
  document.querySelectorAll('[data-community-privacy]').forEach(node => { node.textContent = 'Open community'; });
  const member = Gather.isCommunityMember(community);
  document.querySelectorAll('[data-action="community-join"]').forEach(button => {
    button.textContent = member ? (community.ownerId === Gather.state.currentUserId ? 'Creator' : 'Leave community') : 'Join community';
    button.classList.toggle('button-secondary', member);
    button.classList.toggle('button-primary', !member);
    button.disabled = member && community.ownerId === Gather.state.currentUserId;
  });
  syncCommunityCompose(member);
  document.querySelectorAll('[data-current-avatar]').forEach(node => {
    const user = Gather.currentUser();
    if (!user) return;
    node.innerHTML = user.photo ? `<img src="${Gather.escapeHTML(Gather.safePhoto(user.photo))}" alt="">` : Gather.escapeHTML(user.name.slice(0, 1).toUpperCase());
  });
  const posts = Gather.state.posts.filter(post => (post.communityId === community.id || post.communityIds?.includes(community.id)) && Gather.canSee(post));
  const latest = posts.slice().sort(Gather.byNewest);
  const popular = posts.slice().sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0) || Gather.byNewest(a, b));
  const readOnly = !member;
  document.querySelectorAll('[data-community-feed-list]').forEach(container => {
    container.innerHTML = latest.map(post => Gather.renderPost(post, { readOnly })).join('');
  });
  document.querySelectorAll('[data-community-popular-list]').forEach(container => {
    container.innerHTML = popular.map(post => Gather.renderPost(post, { readOnly })).join('');
  });
  document.querySelectorAll('[data-community-empty]').forEach(node => node.classList.toggle('hidden', latest.length > 0));
  document.querySelectorAll('[data-community-empty-popular]').forEach(node => node.classList.toggle('hidden', popular.length > 0));
  renderMembers(community);
  document.querySelectorAll('[data-community-feed]').forEach(tab => tab.classList.toggle('active', tab.dataset.communityFeed === communityFeed));
  document.querySelectorAll('[data-community-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.communityPanel !== communityFeed));
}

function render() {
  renderDirectory();
  renderDetail();
}

Gather.start({
  render,
  bind() {
    document.querySelector('[data-community-search]')?.addEventListener('input', applyDirectoryView);
    document.querySelectorAll('[data-community-filter]').forEach(button => {
      button.addEventListener('click', () => {
        directoryFilter = button.dataset.communityFilter;
        document.querySelectorAll('[data-community-filter]').forEach(item => item.classList.toggle('active', item === button));
        applyDirectoryView();
      });
    });
    document.querySelectorAll('[data-community-feed]').forEach(tab => {
      tab.addEventListener('click', () => {
        communityFeed = tab.dataset.communityFeed;
        document.querySelectorAll('[data-community-feed]').forEach(item => item.classList.toggle('active', item === tab));
        document.querySelectorAll('[data-community-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.communityPanel !== communityFeed));
        syncCommunityCompose();
      });
    });
  },
  action(name, element) {
    if (name === 'community-first-post') {
      communityFeed = 'latest';
      document.querySelector('[data-community-feed="latest"]')?.click();
      syncCommunityCompose(true);
      document.querySelector('[data-community-post-text]')?.focus();
      return;
    }
    if (name === 'community-show-members') {
      communityFeed = 'members';
      document.querySelector('[data-community-feed="members"]')?.click();
      return;
    }
    if (name === 'community-share') {
      const url = `${location.origin}${location.pathname}${location.search}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(url).then(() => { element.textContent = 'Copied'; }).catch(() => { element.textContent = 'Copy the address bar'; });
      } else element.textContent = 'Copy the address bar';
    }
  }
});
