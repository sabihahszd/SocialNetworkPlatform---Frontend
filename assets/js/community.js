(() => {
  const TOKEN_KEY = 'gather.token';

  const state = {
    currentUserId: '',
    users: [],
    friends: [],
    following: [],
    followers: [],
    outgoingRequests: [],
    posts: [],
    notifications: [],
    communities: [],
    reports: [],
    chats: [],
    site: {
      siteName: 'gather',
      tagline: '',
      logoMark: 'g',
      logoUrl: '',
      footerNote: '',
      aboutBody: '',
      guidelinesBody: '',
      privacyBody: ''
    }
  };

  const appSettings = {
    defaultPrivacy: 'public',
    allowRequests: true,
    showSuggestions: true,
    allowDms: true,
    notifyLikes: true,
    notifyReplies: true,
    notifyReposts: true,
    notifyRequests: true,
    notifyCommunities: true,
    theme: 'system',
    reduceMotion: false,
    autoplay: true,
    blockedUserIds: []
  };

  let session = {};

  const api = {
    token: () => localStorage.getItem(TOKEN_KEY) || '',
    setToken: token => localStorage.setItem(TOKEN_KEY, token),
    clear: () => localStorage.removeItem(TOKEN_KEY)
  };

  const currentUser = () => state.users.find(user => user.id === state.currentUserId) || (state.currentUserId ? null : state.users[0]);
  const isAdmin = () => ['admin', 'superadmin'].includes(String(currentUser()?.role || '').trim().toLowerCase());
  const isSuperAdmin = () => currentUser()?.role === 'superadmin';
  const userById = id => state.users.find(user => user.id === id) || { id: 'someone', name: 'Someone', username: 'someone', photo: '', tone: '' };
  const postAuthor = post => {
    const lookedUp = userById(post?.authorId);
    return {
      ...lookedUp,
      id: post?.authorId || lookedUp.id,
      name: post?.authorName || lookedUp.name,
      username: post?.authorUsername || lookedUp.username,
      photo: post?.authorPhoto || lookedUp.photo
    };
  };
  const isCommunityMember = community => !!community && (community.ownerId === state.currentUserId || community.joined === true || !!community.memberIds?.includes(state.currentUserId));
  const communityUrl = id => `community.html?id=${encodeURIComponent(id)}`;
  const isFriend = id => state.friends.includes(id);
  const isPending = id => state.outgoingRequests.includes(id);
  const isBlocked = id => (appSettings.blockedUserIds || []).includes(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const safeImage = value => {
    try {
      const parsed = new URL(value);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch {
      return '';
    }
  };
  const safePhoto = value => /^data:image\/[\w.+-]+;base64,/i.test(value || '') ? value : safeImage(value);
  const safeMediaSource = value => /^data:(?:image|video)\/[\w.+-]+;base64,/i.test(value || '') ? value : safeImage(value);
  const avatar = (user, extraClass = '') => { const photo = safePhoto(user?.photo); return `<span class="avatar ${escapeHTML(user?.tone || '')} ${extraClass}">${photo ? `<img src="${escapeHTML(photo)}" alt="">` : escapeHTML((user?.name || 'M').slice(0, 1).toUpperCase())}</span>`; };
  const memberCount = value => Number(value || 0).toLocaleString();
  const prettyTime = date => {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };
  const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const allComments = post => (post.comments || []).reduce((count, item) => count + 1 + (item.replies || []).reduce((replyCount, reply) => replyCount + 1 + (reply.replies || []).length, 0), 0);
  const findComment = (comments, id) => {
    for (const comment of comments || []) {
      if (comment.id === id) return comment;
      const nested = findComment(comment.replies, id);
      if (nested) return nested;
    }
    return null;
  };
  const commentByAuthor = (comments, authorId) => (comments || []).some(comment => comment.authorId === authorId || commentByAuthor(comment.replies, authorId));
  const canSee = post => {
    if (userById(post.authorId).active === false) return false;
    if (post.authorId !== state.currentUserId && isBlocked(post.authorId)) return false;
    if (post.authorId === state.currentUserId || post.privacy === 'public') return true;
    if (post.privacy === 'communities') return (post.communityIds || []).some(id => isCommunityMember(state.communities.find(community => community.id === id)));
    return post.privacy === 'friends' && isFriend(post.authorId);
  };
  const findPost = element => {
    const id = element.closest('[data-post-id]')?.dataset.postId;
    return state.posts.find(post => post.id === id);
  };

  function readMediaFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.size) { resolve(null); return; }
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) { reject(new Error('Choose an image or video file.')); return; }
      const maxSize = isVideo ? 2 * 1024 * 1024 : 1.5 * 1024 * 1024;
      if (file.size > maxSize) { reject(new Error(`Choose a ${isVideo ? 'video smaller than 2' : 'photo smaller than 1.5'} MB.`)); return; }
      const reader = new FileReader();
      reader.onload = () => resolve({ src: String(reader.result), type: file.type });
      reader.onerror = () => reject(new Error('That file could not be read. Try another one.'));
      reader.readAsDataURL(file);
    });
  }

  function readPhotoFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.size) { resolve(''); return; }
      if (!file.type.startsWith('image/')) { reject(new Error('Choose an image file.')); return; }
      readMediaFile(file).then(media => resolve(media.src), reject);
    });
  }

  function clearMediaInput(input, previewSelector, noticeSelector) {
    if (!input) return;
    input.value = '';
    const preview = document.querySelector(previewSelector);
    if (preview) { preview.replaceChildren(); preview.hidden = true; }
    const notice = document.querySelector(noticeSelector);
    if (notice) notice.textContent = '';
  }

  function applyBranding(site) {
    if (!site) return;
    state.site = { ...state.site, ...site };
    const name = site.siteName || 'gather';
    const mark = (site.logoMark || name.charAt(0) || 'g').slice(0, 2);
    const logo = site.logoUrl ? safePhoto(site.logoUrl) : '';
    document.querySelectorAll('.brand').forEach(node => {
      const badge = node.querySelector('.brand-mark');
      if (badge) badge.innerHTML = logo ? `<img src="${escapeHTML(logo)}" alt="">` : escapeHTML(mark);
      const word = node.querySelector('.brand-word');
      if (word) word.textContent = name;
    });
    document.querySelectorAll('.auth-logo-mark').forEach(node => {
      node.innerHTML = logo ? `<img src="${escapeHTML(logo)}" alt="">` : escapeHTML(mark);
    });
    document.querySelectorAll('.auth-logo-wordmark').forEach(node => { node.textContent = name; });
    document.querySelectorAll('.auth-logo-panel p').forEach(node => { node.textContent = site.tagline || ''; });
    document.querySelectorAll('.auth-footer').forEach(node => {
      const year = name ? `<span>© ${new Date().getFullYear()} ${escapeHTML(name)}</span>` : '';
      node.innerHTML = `${escapeHTML(site.footerNote || '')} ${year}`;
    });
    document.querySelectorAll('[data-footer-copy]').forEach(node => {
      node.textContent = name ? `© ${new Date().getFullYear()} ${name}` : '';
    });
    const status = document.querySelector('.admin-status');
    if (status && currentUser()) {
      const label = currentUser().role === 'superadmin' ? ' Superadmin access' : ' Admin access';
      [...status.childNodes].forEach(child => { if (child.nodeType === Node.TEXT_NODE) child.textContent = label; });
    }
  }

  function applyPreferences() {
    document.documentElement.classList.toggle('reduce-motion', !!appSettings.reduceMotion);
  }

  function renderNavigation() {
    const page = document.body.dataset.page;
    document.querySelectorAll('.primary-nav').forEach(nav => {
      let communityLink = nav.querySelector('.community-nav-link, a[href="community.html"]');
      if (!communityLink) {
        communityLink = document.createElement('a');
        communityLink.className = 'nav-link community-nav-link';
        communityLink.href = 'community.html';
        communityLink.innerHTML = '<span class="nav-icon"><i class="fa-solid fa-users"></i></span>Community';
        const exploreLink = nav.querySelector('a[href="explore.html"]');
        if (exploreLink) exploreLink.after(communityLink);
        else nav.append(communityLink);
      }
      communityLink.classList.add('community-nav-link');
      communityLink.classList.toggle('active', page === 'community');

      const ensureLink = (href, className, icon, label, active) => {
        let item = nav.querySelector(`.${className}, a[href="${href}"]`);
        if (!item) {
          item = document.createElement('a');
          item.className = 'nav-link';
          item.href = href;
          item.innerHTML = `<span class="nav-icon">${icon}</span>${label}`;
          const anchor = nav.querySelector('a[href="chats.html"]') || nav.querySelector('a[href="community.html"]');
          if (anchor) anchor.after(item);
          else nav.append(item);
        }
        item.classList.add(className);
        item.classList.toggle('active', active);
      };
      ensureLink('chats.html', 'chats-nav-link', '<i class="fa-regular fa-comments"></i>', 'Chats', page === 'chats');
      ensureLink('bookmarks.html', 'bookmarks-nav-link', '<i class="fa-regular fa-bookmark"></i>', 'Bookmarks', page === 'bookmarks');

      let settingsLink = nav.querySelector('.settings-nav-link, a[href="settings.html"]');
      if (!settingsLink) {
        settingsLink = document.createElement('a');
        settingsLink.className = 'nav-link settings-nav-link';
        settingsLink.href = 'settings.html';
        settingsLink.innerHTML = '<span class="nav-icon"><i class="fa-solid fa-gear"></i></span>Settings';
        const profileLink = nav.querySelector('a[href="profile.html"]');
        if (profileLink) profileLink.after(settingsLink);
        else nav.append(settingsLink);
      }
      settingsLink.classList.add('settings-nav-link');
      settingsLink.classList.toggle('active', page === 'settings');

      let adminLink = nav.querySelector('.admin-nav-link, a[href="admin.html"]');
      if (!state.currentUserId) adminLink?.classList.add('hidden');
      else if (!isAdmin()) adminLink?.remove();
      else {
        if (!adminLink) {
          adminLink = document.createElement('a');
          adminLink.className = 'nav-link admin-nav-link';
          adminLink.href = 'admin.html';
          adminLink.innerHTML = '<span class="nav-icon"><i class="fa-solid fa-shield-halved"></i></span>Admin';
          const settingsLink = nav.querySelector('a[href="settings.html"]');
          if (settingsLink) settingsLink.after(adminLink);
          else nav.append(adminLink);
        }
        adminLink.classList.remove('hidden');
        adminLink.classList.toggle('active', page === 'admin');
      }
    });

    document.querySelectorAll('.mobile-nav').forEach(nav => {
      nav.querySelectorAll('a[href="profile.html"]').forEach(link => link.remove());
      let communityLink = nav.querySelector('.community-mobile-link, a[href="community.html"]');
      if (!communityLink) {
        communityLink = document.createElement('a');
        communityLink.className = 'community-mobile-link';
        communityLink.href = 'community.html';
        communityLink.setAttribute('aria-label', 'Community');
        communityLink.innerHTML = '<i class="fa-solid fa-users"></i>';
        const notificationsLink = nav.querySelector('a[href="notifications.html"]');
        if (notificationsLink) notificationsLink.before(communityLink);
        else nav.append(communityLink);
      }
      communityLink.classList.add('community-mobile-link');
      communityLink.setAttribute('aria-label', 'Community');
      communityLink.innerHTML = '<i class="fa-solid fa-users"></i>';
      communityLink.classList.toggle('active', page === 'community');

      const ensureMobileLink = (href, className, icon, label, active) => {
        let item = nav.querySelector(`.${className}, a[href="${href}"]`);
        if (!item) {
          item = document.createElement('a');
          item.className = className;
          item.href = href;
          const anchor = nav.querySelector('a[href="chats.html"]') || nav.querySelector('a[href="community.html"]');
          if (anchor) anchor.after(item);
          else nav.append(item);
        }
        item.classList.add(className);
        item.setAttribute('aria-label', label);
        item.innerHTML = icon;
        item.classList.toggle('active', active);
      };
      ensureMobileLink('chats.html', 'chats-mobile-link', '<i class="fa-regular fa-comments"></i>', 'Chats', page === 'chats');
      ensureMobileLink('bookmarks.html', 'bookmarks-mobile-link', '<i class="fa-regular fa-bookmark"></i>', 'Bookmarks', page === 'bookmarks');

      let adminLink = nav.querySelector('.admin-mobile-link, a[href="admin.html"]');
      if (!state.currentUserId) adminLink?.classList.add('hidden');
      else if (!isAdmin()) adminLink?.remove();
      else {
        if (!adminLink) {
          adminLink = document.createElement('a');
          adminLink.className = 'admin-mobile-link';
          adminLink.href = 'admin.html';
          adminLink.setAttribute('aria-label', 'Admin');
          adminLink.innerHTML = '<i class="fa-solid fa-shield-halved"></i>';
          nav.append(adminLink);
        }
        adminLink.classList.remove('hidden');
        adminLink.classList.toggle('active', page === 'admin');
      }
    });

    document.querySelectorAll('.mobile-account-nav').forEach(nav => {
      nav.querySelector('a[href="profile.html"]')?.classList.toggle('active', page === 'profile');
      nav.querySelector('a[href="settings.html"]')?.classList.toggle('active', page === 'settings');
    });
  }

  function renderIdentity() {
    const user = currentUser();
    if (!user) return;
    const photo = safePhoto(user.photo);
    const letter = escapeHTML((user.name || 'M').slice(0, 1).toUpperCase());
    document.querySelectorAll('.mini-profile .avatar, .composer > .avatar, [data-current-avatar]').forEach(node => {
      node.innerHTML = photo ? `<img src="${escapeHTML(photo)}" alt="">` : letter;
      node.setAttribute('aria-label', user.name || 'Profile');
    });
    document.querySelectorAll('.profile-summary strong, .composer-identity strong').forEach(node => { node.textContent = user.name || ''; });
    document.querySelectorAll('.profile-summary span, .composer-identity span').forEach(node => { node.textContent = user.username ? `@${user.username}` : ''; });
  }

  function renderCircles() {
    document.querySelectorAll('[data-circle-list]').forEach(container => {
      container.innerHTML = state.communities.filter(isCommunityMember).slice(0, 5).map(circle => `<a class="circle-link" href="${communityUrl(circle.id)}"><span class="circle-emoji" style="--circle-color:${escapeHTML(circle.color)}">${escapeHTML(circle.emoji)}</span>${escapeHTML(circle.name)}</a>`).join('');
    });
    document.querySelectorAll('[data-trending-circles]').forEach(container => {
      container.innerHTML = state.communities.slice().sort((a, b) => b.members - a.members).slice(0, 3).map(circle => {
        const art = circle.banner ? `linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url('${escapeHTML(circle.banner)}')` : 'none';
        return `<div class="trend-item"><a class="trend-stamp" href="${communityUrl(circle.id)}" style="--stamp:${escapeHTML(circle.color)};background-image:${art}" aria-label="Open ${escapeHTML(circle.name)}"></a><div class="trend-copy"><a href="${communityUrl(circle.id)}"><strong>${escapeHTML(circle.name)}</strong></a><span>${memberCount(circle.members)} members</span></div><button class="trend-join" data-action="toggle-community" data-community-id="${escapeHTML(circle.id)}"${circle.ownerId === state.currentUserId ? ' disabled' : ''}>${circle.ownerId === state.currentUserId ? 'Creator' : (isCommunityMember(circle) ? 'Joined' : 'Join')}</button></div>`;
      }).join('');
    });
    document.querySelectorAll('[data-community-grid]').forEach(container => {
      container.innerHTML = state.communities.slice().sort((a, b) => b.members - a.members).map(circle => `<article class="community-card" style="--community-bg:${escapeHTML(circle.color)}"><a class="trend-stamp" href="${communityUrl(circle.id)}" style="--stamp:rgba(255,255,255,.7)" aria-label="Open ${escapeHTML(circle.name)}">${escapeHTML(circle.emoji)}</a><a class="community-card-title" href="${communityUrl(circle.id)}"><h3>${escapeHTML(circle.name)}</h3></a><p>${escapeHTML(circle.description)}</p><div class="community-card-foot"><span>${memberCount(circle.members)} members</span><button class="button button-small ${isCommunityMember(circle) ? 'button-following' : 'button-primary'}" data-action="toggle-community" data-community-id="${escapeHTML(circle.id)}"${circle.ownerId === state.currentUserId ? ' disabled' : ''}>${circle.ownerId === state.currentUserId ? 'Creator' : (isCommunityMember(circle) ? 'Joined' : 'Join community')}</button></div></article>`).join('');
    });
  }

  function renderSuggestions() {
    const candidates = state.users.filter(user => user.id !== state.currentUserId && user.active !== false && !isFriend(user.id) && !isBlocked(user.id));
    document.querySelectorAll('[data-suggestions]').forEach(container => {
      container.innerHTML = candidates.slice(0, 3).map(user => `<div class="suggestion">${avatar(user)}<div class="suggestion-info"><strong>${escapeHTML(user.name)}</strong><span>@${escapeHTML(user.username)}</span></div><button class="icon-button" data-action="send-request" data-user-id="${escapeHTML(user.id)}" aria-label="Add ${escapeHTML(user.name)} as a friend">${isPending(user.id) ? '✓' : '＋'}</button></div>`).join('') || '<p class="subtle">You know everyone here. Nice.</p>';
    });
    document.querySelectorAll('[data-people-grid]').forEach(container => {
      container.innerHTML = candidates.map(user => `<article class="person-card">${avatar(user)}<div class="person-card-info"><strong>${escapeHTML(user.name)}</strong><span>@${escapeHTML(user.username)}</span></div><button class="button button-small ${isPending(user.id) ? 'button-following' : 'button-secondary'}" data-action="send-request" data-user-id="${escapeHTML(user.id)}">${isPending(user.id) ? 'Requested' : 'Add'}</button></article>`).join('') || '<p class="subtle">Your people are already here.</p>';
    });
  }

  function renderBadges() {
    const unread = state.notifications.filter(item => !item.read).length;
    const requests = state.notifications.filter(item => item.type === 'friend-request' && item.status === 'pending').length;
    document.querySelectorAll('[data-notification-count]').forEach(node => { node.textContent = unread || ''; });
    document.querySelectorAll('[data-request-count]').forEach(node => {
      node.textContent = requests;
      node.classList.toggle('hidden', !requests);
    });
  }

  function renderSearch(query) {
    const normalized = query.trim().replace(/^@/, '').toLowerCase();
    document.querySelectorAll('[data-search-results]').forEach(container => {
      if (!normalized) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
      }
      const matchingUsers = state.users.filter(user => user.id !== state.currentUserId && user.active !== false && !isBlocked(user.id) && `${user.name} ${user.username}`.toLowerCase().includes(normalized)).slice(0, 5);
      const matchingCircles = state.communities.filter(circle => `${circle.name} ${circle.description}`.toLowerCase().includes(normalized)).slice(0, 3);
      container.classList.remove('hidden');
      container.innerHTML = `${matchingUsers.map(user => `<a class="search-result" href="profile.html">${avatar(user)}<strong>${escapeHTML(user.name)}</strong><span>@${escapeHTML(user.username)}</span></a>`).join('')}${matchingCircles.map(circle => `<a class="search-result" href="${communityUrl(circle.id)}"><span class="trend-stamp" style="--stamp:${escapeHTML(circle.color)}">${escapeHTML(circle.emoji)}</span><strong>${escapeHTML(circle.name)}</strong><span>Community</span></a>`).join('')}${matchingUsers.length + matchingCircles.length ? '' : '<p class="subtle">No matches yet.</p>'}`;
    });
  }

  function renderShell() {
    applyPreferences();
    renderNavigation();
    renderIdentity();
    renderCircles();
    renderSuggestions();
    renderBadges();
  }

  function renderComment(comment, postId, nested = false, includeReplies = true) {
    const lookedUp = userById(comment.authorId);
    const author = {
      ...lookedUp,
      id: comment.authorId || lookedUp.id,
      name: comment.authorName || lookedUp.name,
      username: comment.authorUsername || lookedUp.username,
      photo: comment.authorPhoto || lookedUp.photo
    };
    const manage = author.id === state.currentUserId ? `<button class="comment-reply-button" type="button" data-action="edit-comment" data-comment-id="${escapeHTML(comment.id)}">Edit</button><button class="comment-reply-button" type="button" data-action="delete-comment" data-comment-id="${escapeHTML(comment.id)}">Delete</button>` : '';
    const replies = includeReplies ? (comment.replies || []).map(reply => renderComment(reply, postId, true)).join('') : '';
    return `<div class="${nested ? 'comment-reply' : 'comment-item'}" data-comment-id="${escapeHTML(comment.id)}"><div class="post-header"><a href="profile.html" aria-label="${escapeHTML(author.name)} profile">${avatar(author)}</a><div class="post-author"><strong>${escapeHTML(author.name)}</strong><span class="handle">@${escapeHTML(author.username)}</span><span class="post-context">${prettyTime(comment.createdAt)}</span></div></div><p class="post-text">${escapeHTML(comment.text)}</p><div class="comment-tools"><button class="comment-reply-button" type="button" data-action="reply-comment" data-comment-id="${escapeHTML(comment.id)}" data-post-id="${escapeHTML(postId)}">Reply</button>${manage}</div></div>${replies}`;
  }

  function renderPost(post, { readOnly = false } = {}) {
    const author = postAuthor(post);
    const likes = post.likes || [];
    const reposts = post.reposts || [];
    const bookmarks = post.bookmarks || [];
    const comments = post.comments || [];
    const liked = likes.includes(state.currentUserId);
    const reposted = reposts.includes(state.currentUserId);
    const bookmarked = bookmarks.includes(state.currentUserId);
    const image = escapeHTML(safePhoto(post.image));
    const video = escapeHTML(safeMediaSource(post.video));
    const actions = readOnly ? '' : `<div class="post-actions"><button class="post-action${liked ? ' liked' : ''}" type="button" data-action="toggle-like" aria-label="${liked ? 'Unlike' : 'Like'} post"><i class="${liked ? 'fa-solid' : 'fa-regular'} fa-heart"></i><span class="action-count">${likes.length}</span></button><button class="post-action${reposted ? ' reposted' : ''}" type="button" data-action="toggle-repost" aria-label="${reposted ? 'Undo repost' : 'Repost'}"><i class="fa-solid fa-retweet"></i><span class="action-count">${reposts.length}</span></button><button class="post-action" type="button" data-action="open-post" data-post-id="${escapeHTML(post.id)}" aria-label="Open replies"><i class="fa-regular fa-comment"></i><span class="action-count">${comments.length}</span></button><button class="post-action${bookmarked ? ' bookmarked' : ''}" type="button" data-action="toggle-bookmark" aria-label="${bookmarked ? 'Unsave post' : 'Save post'}"><i class="${bookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i><span class="action-count">${bookmarks.length}</span></button><button class="post-action" type="button" data-action="share-post" aria-label="Share post"><i class="fa-solid fa-share-nodes"></i></button></div>`;
    const commentForm = readOnly ? '' : '<form class="comment-form" data-comment-form><input name="comment" aria-label="Write a reply" placeholder="Add a thoughtful reply..." maxlength="240" required><button type="submit">Reply</button></form>';
    const audience = post.privacy === 'communities' ? 'Communities' : post.privacy === 'friends' ? 'Friends' : 'Everyone';
    return `<article class="post-card" data-post-id="${escapeHTML(post.id)}"><div class="post-header"><a href="profile.html" aria-label="${escapeHTML(author.name)} profile">${avatar(author)}</a><div class="post-author"><strong>${escapeHTML(author.name)}</strong><span class="handle">@${escapeHTML(author.username)}</span><span class="post-context"><span class="context-icon">${post.privacy === 'public' ? '✳' : '◎'}</span>${audience} · ${prettyTime(post.createdAt)} <a class="post-open-link" href="home.html?post=${encodeURIComponent(post.id)}">View post</a></span></div><button class="icon-button post-menu" data-action="post-options" aria-label="Post options">···</button></div><p class="post-text">${escapeHTML(post.text)}</p>${video ? `<video class="post-image" src="${video}" controls preload="metadata" aria-label="Video shared by ${escapeHTML(author.name)}"></video>` : image ? `<img class="post-image" src="${image}" alt="Photo shared by ${escapeHTML(author.name)}" loading="lazy">` : ''}${actions}${comments.length ? `<div class="comment-list">${comments.map(comment => renderComment(comment, post.id)).join('')}</div>` : ''}${commentForm}</article>`;
  }

  function ensurePostActionStyles() {
    if (document.querySelector('[data-post-action-styles]')) return;
    const style = document.createElement('style');
    style.dataset.postActionStyles = '';
    style.textContent = 'html.reduce-motion *{animation-duration:0s!important;transition:none!important;scroll-behavior:auto!important}input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),select,textarea{border-radius:10px!important}.gather-action-dialog{width:min(440px,calc(100% - 32px));max-height:calc(100% - 32px);padding:0;border:1px solid var(--line,#e5e9e3);border-radius:10px;color:var(--ink,#23332e);background:var(--paper,#fff);box-shadow:0 12px 40px rgba(25,50,38,.15)}.gather-action-dialog::backdrop{background:rgba(28,45,37,.45);backdrop-filter:blur(3px)}.gather-action-content{position:relative;display:grid;gap:11px;padding:28px}.gather-action-content h2{margin:0;font-size:22px}.gather-action-content .modal-copy{margin:0 0 3px;color:var(--muted,#7a8780);font-size:12px}.gather-action-options{display:grid;gap:8px}.gather-action-options a{text-align:center}.gather-action-section-title{margin:4px 0 0;color:var(--muted,#7a8780);font-size:10px;font-weight:700;text-transform:uppercase}.gather-action-notice{min-height:16px;margin:0;color:var(--forest-deep,#58476f);font-size:11px}.gather-action-dialog .field-label{margin:0}.gather-action-dialog .field-label input{width:100%}.post-action.liked{color:var(--forest-deep,#58476f)}.post-action.reposted{color:var(--forest-deep,#58476f)}.post-action.bookmarked{color:var(--forest-deep,#58476f)}.comment-content{display:flex;align-items:flex-start;gap:8px}.comment-tools,.chat-message-actions{display:flex;gap:10px;margin-top:4px}.comment-tools button,.chat-message-actions button{padding:0;border:0;color:inherit;background:transparent;cursor:pointer;font-size:10px;opacity:.76}.comment-tools button:hover,.chat-message-actions button:hover{opacity:1;text-decoration:underline}.chat-message-actions{justify-content:flex-end}.inline-edit-form{display:grid;gap:6px}.inline-edit-form textarea{width:100%;padding:7px;border:1px solid var(--line,#e5e9e3);background:white;font:inherit;border-radius:10px!important}.inline-edit-form>div{display:flex;justify-content:flex-end;gap:9px}.inline-edit-form button{padding:2px 0;border:0;color:inherit;background:transparent;cursor:pointer;font-size:10px;font-weight:700}.banner-photo-preview{width:100%;height:82px;border-radius:8px;object-fit:cover;background:#efeaf5}.brand-mark img,.auth-logo-mark img{width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block}.admin-brand-form{display:grid;gap:12px;max-width:560px}.admin-member-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.post-action i{font-size:16px;line-height:1;pointer-events:none}.post-card{cursor:pointer}.post-card .comment-list,.post-card .comment-form{display:none!important}[data-home-post-detail] .comment-list{display:grid!important}[data-home-post-detail] .comment-form{display:flex!important}.post-action.reposted{color:#806c9c}.post-action .action-count{min-width:1ch;font-size:12px;font-weight:600;line-height:1}.share-chat-list{display:grid;gap:4px}.share-chat{display:flex;align-items:center;gap:10px;width:100%;padding:8px;border:0;border-radius:10px;color:inherit;background:transparent;cursor:pointer;text-align:left}.share-chat:hover{background:var(--leaf-pale,#f2ecf8)}.share-chat .avatar{width:36px;height:36px;font-size:13px}.share-chat-copy{display:grid;min-width:0;flex:1}.share-chat-copy span,.share-chat-kind{color:var(--muted,#7a8780);font-size:11px}.share-platforms{display:flex;gap:10px;margin-top:8px}.share-platforms a,.share-platforms button{width:42px;height:42px;display:grid;place-items:center;border:1px solid var(--line,#e6e1ee);border-radius:50%;color:#806c9c;background:#fff;font-size:16px;text-decoration:none;cursor:pointer}.share-platforms a:hover,.share-platforms button:hover{background:var(--leaf-pale,#f2ecf8)}input[type="file"]::file-selector-button,input[type="file"]::-webkit-file-upload-button{margin-right:10px;padding:0 14px;height:32px;border:1px solid #e4dced;border-radius:20px;color:var(--forest,#806c9c);background:#fff;cursor:pointer;font:inherit;font-size:11px;font-weight:700;transition:background .16s ease}input[type="file"]::file-selector-button:hover,input[type="file"]::-webkit-file-upload-button:hover{background:#f4f0f8}.field-label input[type="file"],.auth-form .field-label input[type="file"],.register-form-wrap .auth-form .field-label input[type="file"]{min-height:32px;padding:0;border:0;background:transparent;font-size:12px;font-weight:400}.fa-regular.fa-house{width:1em;height:1em;font-size:1.22em;vertical-align:-.2em}.fa-regular.fa-house::before{content:"" !important;display:block;width:1em;height:1em;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath fill=%27white%27 d=%27M12 1.6 2.2 10.2h2.2V21.4h4.8V15.2h5.6v6.2h4.8V10.2h2.2L12 1.6zM7.6 11.4 12 7.6l4.8 3.8v6.4H7.6V11.4z%27/%3E%3C/svg%3E") center/contain no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath fill=%27white%27 d=%27M12 1.6 2.2 10.2h2.2V21.4h4.8V15.2h5.6v6.2h4.8V10.2h2.2L12 1.6zM7.6 11.4 12 7.6l4.8 3.8v6.4H7.6V11.4z%27/%3E%3C/svg%3E") center/contain no-repeat}.file-placeholder-mark{position:relative;display:grid;place-items:center;min-height:112px;overflow:hidden;border-radius:10px;background:#e3e1e6 center/cover no-repeat;color:#8a8491;font-size:22px}.file-placeholder:has([data-avatar-file]) .file-placeholder-mark{width:112px}.file-placeholder-mark:hover{background-color:#d8d5db}.file-placeholder-mark i{pointer-events:none}.file-placeholder.has-file .file-placeholder-mark i{display:none}.file-placeholder-mark input[type="file"]{position:absolute;inset:0;z-index:1;width:100%;height:100%;min-height:0;margin:0;padding:0;border:0;background:transparent;opacity:0;cursor:pointer}.file-placeholder.has-file+.photo-preview,.file-placeholder.has-file+.card-art-banner,.file-placeholder.has-file+.banner-photo-preview{display:none!important}.trends-section .trend-stamp{overflow:hidden;background-color:var(--stamp,#e1d5f0);background-position:center 48%;background-size:cover;background-repeat:no-repeat;color:transparent;font-size:0}';
    document.head.append(style);
  }

  function ensureReportModal() {
    if (document.querySelector('[data-report-modal]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.dataset.reportModal = '';
    dialog.innerHTML = `<div class="modal-content"><button class="modal-close" type="button" data-action="close-report" aria-label="Close">×</button><h2>Report this post</h2><p class="modal-copy">Reports are private and reviewed by a moderator.</p><label class="field-label">What is the concern?<select data-report-reason><option>Spam or misleading content</option><option>Harassment or bullying</option><option>Hateful or harmful content</option><option>Something else</option></select></label><label class="field-label">Anything else we should know? <span class="optional">optional</span><textarea data-report-details rows="3" maxlength="240" placeholder="Add a little context"></textarea></label><p class="report-notice" data-report-notice role="status"></p><button class="button button-primary" type="button" data-action="submit-report">Send report</button></div>`;
    document.body.append(dialog);
  }

  function ensureShareModal() {
    if (document.querySelector('[data-share-modal]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'gather-action-dialog';
    dialog.dataset.shareModal = '';
    dialog.innerHTML = '<div class="gather-action-content"><button class="modal-close" type="button" data-action="close-dialog" aria-label="Close">×</button><h2>Share this post</h2><p class="modal-copy">Choose how to share the post link.</p><div class="gather-action-options" data-share-options></div><label class="field-label hidden" data-share-url-wrap>Post link<input type="url" readonly data-share-url></label><p class="gather-action-notice" data-share-notice role="status"></p></div>';
    document.body.append(dialog);
  }

  function ensurePostOptionsModal() {
    if (document.querySelector('[data-post-options-modal]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'gather-action-dialog';
    dialog.dataset.postOptionsModal = '';
    dialog.innerHTML = '<div class="gather-action-content"><button class="modal-close" type="button" data-action="close-dialog" aria-label="Close">×</button><h2>Manage post</h2><div class="gather-action-options" data-post-options-list></div></div>';
    document.body.append(dialog);
  }

  function ensureCommunityModal() {
    if (document.querySelector('[data-modal]')) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.dataset.modal = '';
    dialog.innerHTML = '<form method="dialog" class="modal-content"><button class="modal-close" type="button" data-action="close-dialog" aria-label="Close">×</button><h2>Create a community</h2><p class="modal-copy">Give your people a place to find each other.</p><label class="field-label">Community name<input name="community-name" maxlength="32" required placeholder="Community name"></label><label class="field-label">A short description<textarea name="community-description" maxlength="120" rows="3" placeholder="What brings this community together?"></textarea></label><label class="field-label">Card art<input name="card-art" type="file" accept="image/*" data-card-art-file></label><div class="card-art-banner" data-card-art-banner hidden></div><p class="photo-notice" data-card-art-notice role="status"></p><button class="button button-primary" type="button" data-action="submit-community">Create community</button></form>';
    document.body.append(dialog);
    initFilePlaceholders();
  }

  function showShareUrlFallback(url, message = 'Select and copy the post link.') {
    const input = document.querySelector('[data-share-url]');
    const notice = document.querySelector('[data-share-notice]');
    if (!input) return;
    input.value = url;
    input.closest('[data-share-url-wrap]')?.classList.remove('hidden');
    if (notice) notice.textContent = message;
    input.focus();
    input.select();
  }

  function showCardArt(banner, photo) {
    if (!banner || !photo) return;
    banner.hidden = false;
    banner.style.backgroundImage = `linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url("${photo.replace(/"/g, '')}")`;
  }

  function initFilePlaceholders() {
    document.querySelectorAll('input[type="file"]').forEach(input => {
      if (input.closest('.attach-button, .community-image-field, .file-placeholder-mark')) return;
      const label = input.closest('label');
      if (!label) return;
      label.classList.add('file-placeholder');
      const mark = document.createElement('span');
      mark.className = 'file-placeholder-mark';
      mark.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>';
      input.replaceWith(mark);
      mark.append(input);
      const clear = () => {
        label.classList.remove('has-file');
        mark.style.backgroundImage = '';
      };
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file || !file.type.startsWith('image/')) { clear(); return; }
        readPhotoFile(file).then(photo => {
          if (input.files?.[0] !== file) return;
          label.classList.add('has-file');
          mark.style.backgroundImage = `url("${photo.replace(/"/g, '')}")`;
        }).catch(clear);
      });
      input.form?.addEventListener('reset', () => setTimeout(clear, 0));
    });
  }

  function initCardArtUploads() {
    document.querySelectorAll('[data-card-art-file]').forEach(input => input.addEventListener('change', async () => {
      const file = input.files?.[0];
      const form = input.closest('form');
      const banner = form?.querySelector('[data-card-art-banner]');
      const notice = form?.querySelector('[data-card-art-notice]');
      if (!file) return;
      try {
        const photo = await readPhotoFile(file);
        showCardArt(banner, photo);
        if (notice) notice.textContent = '';
      } catch (error) {
        input.value = '';
        if (banner) { banner.hidden = true; banner.style.backgroundImage = ''; }
        if (notice) notice.textContent = error.message;
      }
    }));
  }

  function initPhotoUploads() {
    document.querySelectorAll('[data-avatar-file]').forEach(input => input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const form = input.closest('form');
      const preview = form?.querySelector('[data-avatar-preview]');
      const notice = form?.querySelector('[data-photo-notice]');
      try {
        const photo = await readPhotoFile(file);
        if (preview) { preview.src = photo; preview.hidden = false; }
        if (notice) notice.textContent = '';
      } catch (error) {
        input.value = '';
        if (notice) notice.textContent = error.message;
      }
    }));
  }

  function initPostMediaUploads() {
    const inputs = [...document.querySelectorAll('[data-post-media]'), ...document.querySelectorAll('[data-community-post-image]')];
    inputs.forEach(input => input.addEventListener('change', async () => {
      const file = input.files?.[0];
      const preview = document.querySelector(input.matches('[data-post-media]') ? '[data-post-media-preview]' : '[data-community-media-preview]');
      const notice = document.querySelector(input.matches('[data-post-media]') ? '[data-post-media-notice]' : '[data-community-media-notice]');
      if (!file) return;
      try {
        const media = await readMediaFile(file);
        const element = document.createElement(media.type.startsWith('video/') ? 'video' : 'img');
        element.className = 'media-preview-content';
        element.src = media.src;
        if (element instanceof HTMLVideoElement) { element.controls = true; element.preload = 'metadata'; }
        else element.alt = 'Selected upload preview';
        preview?.replaceChildren(element);
        if (preview) preview.hidden = false;
        if (notice) notice.textContent = '';
      } catch (error) {
        input.value = '';
        if (preview) { preview.replaceChildren(); preview.hidden = true; }
        if (notice) notice.textContent = error.message;
      }
    }));
  }

  function reload() {}

  function commit() {
    return false;
  }

  function adjustCount(element, delta) {
    const count = element.querySelector('.action-count');
    if (!count) return;
    count.textContent = String(Math.max(0, (parseInt(count.textContent, 10) || 0) + delta));
  }

  function visiblePostCard(id) {
    const cards = [...document.querySelectorAll('.post-card')].filter(card => card.dataset.postId === id);
    return cards.find(card => card.getClientRects().length) || cards[0] || null;
  }

  async function handleShellAction(name, element, event) {
    switch (name) {
      case 'toggle-like': {
        const liked = element.classList.toggle('liked');
        element.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
        const icon = element.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-solid', liked);
          icon.classList.toggle('fa-regular', !liked);
        }
        adjustCount(element, liked ? 1 : -1);
        return true;
      }
      case 'toggle-repost': {
        const reposted = element.classList.toggle('reposted');
        element.setAttribute('aria-label', reposted ? 'Undo repost' : 'Repost');
        adjustCount(element, reposted ? 1 : -1);
        return true;
      }
      case 'toggle-bookmark': {
        const saved = element.classList.toggle('bookmarked');
        element.setAttribute('aria-label', saved ? 'Unsave post' : 'Save post');
        const icon = element.querySelector('i');
        if (icon) {
          icon.classList.toggle('fa-solid', saved);
          icon.classList.toggle('fa-regular', !saved);
        }
        adjustCount(element, saved ? 1 : -1);
        return true;
      }
      case 'open-post': {
        const card = element.closest('.post-card');
        const id = element.dataset.postId || card?.dataset.postId;
        if (!id) return true;
        if (card) sessionStorage.setItem(`gather.post.${id}`, card.outerHTML);
        window.location.href = `home.html?post=${encodeURIComponent(id)}`;
        return true;
      }
      case 'focus-comment':
        element.closest('.post-card')?.querySelector('[name="comment"]')?.focus();
        return true;
      case 'reply-comment': {
        const form = element.closest('.post-card')?.querySelector('[data-comment-form]');
        if (form) {
          form.dataset.replyParent = element.dataset.commentId;
          form.querySelector('input').placeholder = 'Write a reply...';
          form.querySelector('input').focus();
        }
        return true;
      }
      case 'edit-comment':
      case 'delete-comment': {
        const post = findPost(element);
        const comment = post && findComment(post.comments, element.dataset.commentId);
        if (!comment || comment.authorId !== state.currentUserId) return true;
        if (name === 'edit-comment') {
          const textNode = element.closest('.comment-item, .comment-reply')?.querySelector('.post-text');
          if (!textNode) return true;
          const form = document.createElement('form');
          form.className = 'inline-edit-form';
          form.dataset.editCommentForm = '';
          form.dataset.postId = post.id;
          form.dataset.commentId = comment.id;
          form.innerHTML = `<textarea name="edit-text" rows="2" maxlength="240" required aria-label="Edit reply">${escapeHTML(comment.text)}</textarea><div><button type="submit">Save</button><button type="button" data-action="cancel-comment-edit">Cancel</button></div>`;
          textNode.replaceWith(form);
          form.querySelector('textarea').focus();
          return true;
        }
        return true;
      }
      case 'cancel-comment-edit':
        session.render?.();
        return true;
      case 'cancel-post-edit': {
        const form = element.closest('[data-edit-post-form]');
        if (!form) return true;
        const paragraph = document.createElement('p');
        paragraph.className = 'post-text';
        paragraph.textContent = form.elements.namedItem('edit-text').value;
        form.replaceWith(paragraph);
        return true;
      }
      case 'share-post': {
        const post = findPost(element);
        const id = post?.id || element.closest('.post-card')?.dataset.postId;
        if (!id) return true;
        ensureShareModal();
        const dialog = document.querySelector('[data-share-modal]');
        dialog.dataset.postId = id;
        const copy = dialog.querySelector('.modal-copy');
        if (copy) copy.textContent = 'Send it to a friend or group, or share the link.';
        const url = new URL(`home.html?post=${encodeURIComponent(id)}`, window.location.href).href;
        const encodedUrl = encodeURIComponent(url);
        const chatIds = new Set(state.chats.map(thread => thread.participantId));
        const shareTargets = [
          ...state.chats.map(thread => ({ user: userById(thread.participantId), kind: 'Chat' })),
          ...state.friends.filter(friendId => !chatIds.has(friendId)).map(friendId => ({ user: userById(friendId), kind: 'Friend' }))
        ].filter(target => target.user?.id && target.user.id !== 'someone');
        const shareList = shareTargets.length ? `<div class="share-chat-list">${shareTargets.map(target => `<button class="share-chat" type="button" data-action="share-to-chat" data-user-id="${escapeHTML(target.user.id)}">${avatar(target.user)}<span class="share-chat-copy"><strong>${escapeHTML(target.user.name)}</strong><span>@${escapeHTML(target.user.username)}</span></span><span class="share-chat-kind">${target.kind}</span></button>`).join('')}</div>` : '';
        document.querySelector('[data-share-options]').innerHTML = `${shareList}<div class="share-platforms"><button type="button" data-action="share-copy" data-url="${escapeHTML(url)}" aria-label="Copy link"><i class="fa-regular fa-clone"></i></button><a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener" aria-label="Share on Facebook"><i class="fa-brands fa-facebook"></i></a><a href="https://twitter.com/intent/tweet?url=${encodedUrl}" target="_blank" rel="noopener" aria-label="Share on X"><i class="fa-brands fa-x-twitter"></i></a><a href="https://wa.me/?text=${encodedUrl}" target="_blank" rel="noopener" aria-label="Share on WhatsApp"><i class="fa-brands fa-whatsapp"></i></a></div>`;
        document.querySelector('[data-share-notice]').textContent = '';
        document.querySelector('[data-share-url-wrap]')?.classList.add('hidden');
        dialog.showModal();
        return true;
      }
      case 'share-copy': {
        const url = element.dataset.url;
        if (!url) return true;
        const notice = element.closest('dialog')?.querySelector('[data-share-notice]');
        if (navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(url); if (notice) notice.textContent = 'Link copied'; }
          catch { showShareUrlFallback(url); }
        } else showShareUrlFallback(url);
        return true;
      }
      case 'share-to-chat': {
        const label = element.querySelector('.share-chat-kind');
        if (label) label.textContent = 'Sent';
        return true;
      }
      case 'close-dialog':
        element.closest('dialog')?.close();
        return true;
      case 'post-options': {
        const id = element.closest('.post-card')?.dataset.postId || '';
        ensurePostOptionsModal();
        const dialog = document.querySelector('[data-post-options-modal]');
        const title = dialog.querySelector('h2');
        if (title) title.textContent = 'Post options';
        dialog.querySelector('[data-post-options-list]').innerHTML = `<button class="button button-secondary" type="button" data-action="edit-post" data-post-id="${escapeHTML(id)}">Edit</button><button class="button button-secondary" type="button" data-action="delete-post" data-post-id="${escapeHTML(id)}">Delete</button><button class="button button-secondary" type="button" data-action="report-post" data-post-id="${escapeHTML(id)}">Report</button>`;
        dialog.showModal();
        return true;
      }
      case 'edit-post': {
        const id = element.dataset.postId || '';
        document.querySelector('[data-post-options-modal]')?.close();
        const card = visiblePostCard(id);
        const textNode = card?.querySelector('.post-text');
        if (!textNode || card.querySelector('[data-edit-post-form]')) return true;
        const editor = document.createElement('form');
        editor.className = 'inline-edit-form';
        editor.dataset.editPostForm = '';
        editor.dataset.postId = id;
        editor.innerHTML = `<textarea name="edit-text" rows="3" maxlength="1000" required aria-label="Edit post">${escapeHTML(textNode.textContent)}</textarea><div><button type="submit">Save</button><button type="button" data-action="cancel-post-edit">Cancel</button></div>`;
        textNode.replaceWith(editor);
        editor.querySelector('textarea').focus();
        return true;
      }
      case 'delete-post': {
        const id = element.dataset.postId;
        document.querySelector('[data-post-options-modal]')?.close();
        if (id) document.querySelectorAll('.post-card').forEach(card => { if (card.dataset.postId === id) card.remove(); });
        return true;
      }
      case 'report-post': {
        document.querySelector('[data-post-options-modal]')?.close();
        ensureReportModal();
        const dialog = document.querySelector('[data-report-modal]');
        dialog.dataset.postId = element.dataset.postId;
        dialog.querySelector('[data-report-notice]').textContent = '';
        dialog.showModal();
        return true;
      }
      case 'close-report':
        document.querySelector('[data-report-modal]')?.close();
        return true;
      case 'submit-report':
        document.querySelector('[data-report-modal]')?.close();
        return true;
      case 'mark-read':
        document.querySelectorAll('.notification-row.unread').forEach(row => row.classList.remove('unread'));
        document.querySelectorAll('[data-notification-count]').forEach(badge => { badge.textContent = ''; });
        return true;
      case 'send-request': {
        if (element.matches('.button')) {
          element.textContent = 'Requested';
          element.classList.remove('button-secondary');
          element.classList.add('button-following');
        }
        return true;
      }
      case 'accept-request':
      case 'decline-request': {
        const actions = element.closest('.friend-row-actions, .notification-actions');
        if (actions) {
          const status = document.createElement('span');
          status.className = 'request-status';
          status.textContent = element.dataset.action === 'accept-request' ? 'Friends' : 'Declined';
          actions.replaceWith(status);
        }
        return true;
      }
      case 'toggle-community': {
        if (element.matches('button')) {
          const joining = !/joined/i.test(element.textContent);
          const labeledJoin = /community/i.test(element.textContent);
          element.textContent = joining ? 'Joined' : (labeledJoin ? 'Join community' : 'Join');
          const name = element.closest('article, .trend-item')?.querySelector('h2, h3, strong')?.textContent?.trim();
          const select = document.querySelector('#post-privacy');
          if (select && name) {
            const value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const existing = [...select.options].find(option => option.value === value);
            if (joining && !existing) select.add(new Option(name, value));
            if (!joining && existing) existing.remove();
          }
        }
        return true;
      }
      case 'new-community':
        ensureCommunityModal();
        document.querySelector('[data-modal]')?.showModal();
        return true;
      case 'submit-community': {
        event.preventDefault();
        const form = element.closest('form');
        const name = form?.elements.namedItem('community-name')?.value.trim();
        if (!name) return true;
        const description = form.elements.namedItem('community-description')?.value.trim() || '';
        const file = form.querySelector('[data-card-art-file]')?.files?.[0];
        const notice = form.querySelector('[data-card-art-notice]');
        let photo = '';
        if (file) {
          try { photo = await readPhotoFile(file); }
          catch (error) { if (notice) notice.textContent = error.message; return true; }
        }
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'community';
        const owner = currentUser();
        const record = { name, description, banner: photo, color: '#e1d5f0', emoji: name.slice(0, 1).toUpperCase(), members: '1', owner: owner?.name || '', joined: true, author: owner?.name || '', handle: owner ? `@${owner.username}` : '', initial: (owner?.name || name).slice(0, 1).toUpperCase(), post: `Welcome to ${name}.` };
        try { sessionStorage.setItem(`gather.community.${id}`, JSON.stringify(record)); }
        catch { sessionStorage.setItem(`gather.community.${id}`, JSON.stringify({ ...record, banner: '' })); }
        const grid = document.querySelector('[data-community-directory]');
        if (grid && ![...grid.querySelectorAll('.directory-card-art')].some(link => link.getAttribute('href') === `community.html?id=${id}`)) {
          const article = document.createElement('article');
          article.className = 'directory-card';
          const art = photo
            ? `background-image:linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url("${photo.replace(/"/g, '')}")`
            : '--community-color:#e1d5f0';
          article.innerHTML = `<a class="directory-card-art" href="community.html?id=${encodeURIComponent(id)}" style="${art}" aria-label="Open ${escapeHTML(name)}"></a><div class="directory-card-body"><a class="directory-card-title" href="community.html?id=${encodeURIComponent(id)}"><h2>${escapeHTML(name)}</h2></a><p class="directory-card-description">${escapeHTML(description || 'A new community.')}</p><div class="directory-card-footer"><span class="directory-members">1 member</span><span class="directory-joined">✓ Joined</span></div></div>`;
          grid.prepend(article);
        }
        const select = document.querySelector('#post-privacy');
        if (select && ![...select.options].some(option => option.value === id)) select.add(new Option(name, id));
        const banner = form.querySelector('[data-card-art-banner]');
        if (banner) { banner.hidden = true; banner.style.backgroundImage = ''; }
        form.closest('dialog')?.close();
        form.reset();
        return true;
      }
      case 'toggle-account-nav': {
        const panel = document.querySelector('.mobile-account');
        const open = !!panel?.classList.toggle('is-open');
        element.setAttribute('aria-expanded', open ? 'true' : 'false');
        return true;
      }
      case 'close-account-nav':
        document.querySelector('.mobile-account')?.classList.remove('is-open');
        document.querySelector('[data-action="toggle-account-nav"]')?.setAttribute('aria-expanded', 'false');
        return true;
      case 'account-menu':
        api.clear();
        window.location.href = 'login.html';
        return true;
      case 'focus-search':
        document.querySelector('[data-search-input]')?.focus();
        return true;
      default:
        return false;
    }
  }

  async function handleShellSubmit(event) {
    const postEditForm = event.target.closest('[data-edit-post-form]');
    if (postEditForm) {
      event.preventDefault();
      const text = postEditForm.elements.namedItem('edit-text').value.trim();
      if (!text) return true;
      const paragraph = document.createElement('p');
      paragraph.className = 'post-text';
      paragraph.textContent = text;
      postEditForm.replaceWith(paragraph);
      return true;
    }
    const commentEditForm = event.target.closest('[data-edit-comment-form]');
    if (commentEditForm) {
      event.preventDefault();
      return true;
    }
    const form = event.target.closest('[data-comment-form]');
    if (!form) return false;
    event.preventDefault();
    const input = form.elements.namedItem('comment');
    const text = input?.value.trim();
    const card = form.closest('.post-card');
    if (!text || !card) return true;
    let list = card.querySelector('.comment-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'comment-list';
      form.before(list);
    }
    const author = currentUser();
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.innerHTML = `<div class="post-header"><a href="profile.html" aria-label="${escapeHTML(author?.name || 'Profile')} profile">${author ? avatar(author) : '<span class="avatar"></span>'}</a><div class="post-author"><strong>${escapeHTML(author?.name || '')}</strong><span class="handle">@${escapeHTML(author?.username || '')}</span><span class="post-context">just now</span></div></div><p class="post-text">${escapeHTML(text)}</p><div class="comment-tools"><button class="comment-reply-button" type="button" data-action="reply-comment">Reply</button></div>`;
    const parent = list.querySelector('.comment-item:last-child');
    if (form.dataset.replyParent && parent) {
      const reply = document.createElement('div');
      reply.className = 'comment-reply';
      reply.innerHTML = item.innerHTML;
      parent.append(reply);
    } else list.append(item);
    delete form.dataset.replyParent;
    input.value = '';
    if (input) input.placeholder = 'Add a thoughtful reply...';
    const replyButton = card.querySelector('[data-action="open-post"]');
    if (replyButton) adjustCount(replyButton, 1);
    return true;
  }

  function bindShell() {
    document.querySelectorAll('a[href="login.html"]').forEach(link => link.addEventListener('click', () => api.clear()));
    initPhotoUploads();
    initCardArtUploads();
    initFilePlaceholders();
    initPostMediaUploads();
    document.querySelectorAll('[data-search-input]').forEach(input => {
      input.addEventListener('input', () => {
        document.querySelectorAll('[data-search-input]').forEach(other => { if (other !== input) other.value = input.value; });
        renderSearch(input.value);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && input.value.trim() && !location.pathname.endsWith('explore.html')) window.location.href = `explore.html?q=${encodeURIComponent(input.value.trim())}`;
      });
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        document.querySelector('.mobile-account')?.classList.remove('is-open');
        document.querySelector('[data-action="toggle-account-nav"]')?.setAttribute('aria-expanded', 'false');
      }
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        event.preventDefault();
        document.querySelector('[data-search-input]')?.focus();
      }
    });
    document.addEventListener('click', async event => {
      const actionElement = event.target.closest('[data-action]');
      const card = event.target.closest('.post-card');
      const openLink = event.target.closest('a.post-open-link');
      if (card?.dataset.postId && !card.closest('[data-home-post-detail]') && (openLink || (!actionElement && !event.target.closest('a, input, textarea, button, label')))) {
        sessionStorage.setItem(`gather.post.${card.dataset.postId}`, card.outerHTML);
        if (!openLink && !actionElement) {
          window.location.href = `home.html?post=${encodeURIComponent(card.dataset.postId)}`;
          return;
        }
      }
      if (!actionElement) return;
      if (await handleShellAction(actionElement.dataset.action, actionElement, event)) return;
      await session.action?.(actionElement.dataset.action, actionElement, event);
    });
    document.addEventListener('submit', async event => {
      if (await handleShellSubmit(event)) return;
      await session.submit?.(event);
    });
  }

  function start(options = {}) {
    session = options;
    ensurePostActionStyles();
    bindShell();
    const query = new URLSearchParams(location.search).get('q');
    if (query) {
      document.querySelectorAll('[data-search-input]').forEach(input => { input.value = query; });
      renderSearch(query);
    }
    options.bind?.();
    const adminAllowed = document.body.dataset.page !== 'admin' || isAdmin();
    document.querySelector('[data-admin-console]')?.classList.toggle('hidden', !adminAllowed);
    document.querySelector('[data-admin-denied]')?.classList.toggle('hidden', adminAllowed);
    renderShell();
    applyBranding(state.site);
    if (adminAllowed) options.render?.();
    if (document.body.classList.contains('auth-page')) document.querySelector('input')?.focus({ preventScroll: true });
  }

  window.Gather = {
    api,
    state,
    appSettings,
    start,
    commit,
    reload,
    renderPost,
    renderComment,
    escapeHTML,
    safePhoto,
    avatar,
    prettyTime,
    byNewest,
    memberCount,
    currentUser,
    userById,
    isAdmin,
    isSuperAdmin,
    isFriend,
    isPending,
    isCommunityMember,
    communityUrl,
    canSee,
    findPost,
    findComment,
    commentByAuthor,
    readPhotoFile,
    readMediaFile,
    clearMediaInput,
    applyBranding
  };
})();

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
      const created = /creator/i.test(card.textContent || '');
      const show = matchesQuery && (
        directoryFilter === 'all'
        || directoryFilter === 'popular'
        || (directoryFilter === 'joined' && (joined || created))
        || (directoryFilter === 'created' && created)
      );
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
  if (directoryFilter === 'created') circles = circles.filter(circle => circle.ownerId === Gather.state.currentUserId);
  if (directoryFilter === 'popular') circles = circles.slice().sort((a, b) => b.members - a.members);
  document.querySelectorAll('[data-community-directory]').forEach(container => {
    container.innerHTML = circles.map(circle => `<article class="directory-card"><a class="directory-card-art" href="${Gather.communityUrl(circle.id)}" style="${circle.banner ? `background-image:linear-gradient(0deg, rgba(25, 53, 39, .13), transparent), url('${Gather.escapeHTML(circle.banner)}')` : `--community-color:${Gather.escapeHTML(circle.color)}`}" aria-label="Open ${Gather.escapeHTML(circle.name)}"></a><div class="directory-card-body"><a class="directory-card-title" href="${Gather.communityUrl(circle.id)}"><h2>${Gather.escapeHTML(circle.name)}</h2></a><p class="directory-card-description">${Gather.escapeHTML(circle.description)}</p><div class="directory-card-footer"><span class="directory-members">${Gather.memberCount(circle.members)} members</span>${circle.ownerId === Gather.state.currentUserId ? '<span class="directory-joined">Creator</span>' : Gather.isCommunityMember(circle) ? '<span class="directory-joined">✓ Joined</span>' : `<button class="button button-small button-primary" data-action="toggle-community" data-community-id="${Gather.escapeHTML(circle.id)}">Join</button>`}</div></div></article>`).join('');
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
  document.querySelectorAll('[data-community-owner]').forEach(node => { node.textContent = community.ownerName || Gather.userById(community.ownerId).name; });
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
    const photo = Gather.safePhoto(user.photo);
    node.innerHTML = photo ? `<img src="${Gather.escapeHTML(photo)}" alt="">` : Gather.escapeHTML((user.name || 'M').slice(0, 1).toUpperCase());
    node.setAttribute('aria-label', user.name || 'Profile');
  });
  document.querySelectorAll('.composer-identity strong').forEach(node => { node.textContent = Gather.currentUser()?.name || ''; });
  document.querySelectorAll('.composer-identity span').forEach(node => {
    const username = Gather.currentUser()?.username;
    node.textContent = username ? `@${username}` : '';
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







//fetch//

const API_BASE = 'http://localhost:5039';

const communityActions = new Set([
  'toggle-like',
  'toggle-repost',
  'toggle-bookmark',
  'delete-post',
  'delete-comment',
  'submit-report',
  'share-to-chat',
  'toggle-community',
  'send-request',
  'submit-community',
  'community-join',
  'community-post'
]);

function showCommunityError(element, error) {
  const message = error?.message === 'Failed to fetch'
    ? 'The server could not be reached.'
    : (error?.message || 'Something went wrong.');
  const notice = element?.closest('form, dialog, .community-compose')?.querySelector('[data-card-art-notice], [data-community-media-notice], [role="status"]');
  if (notice) {
    notice.textContent = message;
    return;
  }
  if (new URLSearchParams(window.location.search).has('id')) {
    const mediaNotice = document.querySelector('[data-community-media-notice]');
    if (mediaNotice) {
      mediaNotice.textContent = message;
      return;
    }
  }
  document.querySelectorAll('[data-community-directory-empty] p, [data-community-empty] p').forEach(copy => {
    copy.textContent = message;
  });
  document.querySelector('[data-community-directory-empty]')?.classList.remove('hidden');
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = Gather.api.token();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    Gather.api.clear();
    window.location.href = 'login.html';
    return null;
  }
  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || 'Request failed.');
  return data;
}

function rememberUser(user) {
  if (!user?.id) return;
  const index = Gather.state.users.findIndex(item => item.id === user.id);
  if (index === -1) Gather.state.users.push(user);
  else Gather.state.users[index] = { ...Gather.state.users[index], ...user };
}

function upsertPost(post) {
  if (!post?.id) return;
  const index = Gather.state.posts.findIndex(item => item.id === post.id);
  if (index === -1) Gather.state.posts.unshift(post);
  else Gather.state.posts[index] = post;
}

function upsertCommunity(community) {
  if (!community?.id) return;
  const index = Gather.state.communities.findIndex(item => item.id === community.id);
  if (index === -1) Gather.state.communities.unshift(community);
  else Gather.state.communities[index] = community;
}

function rememberSite(site) {
  if (!site) return;
  Gather.state.site = { ...Gather.state.site, ...site };
  Gather.applyBranding(Gather.state.site);
}

function paintCommunity() {
  Gather.applyBranding(Gather.state.site);
  Gather.renderShell();
  render();
  document.querySelector('.request-section')?.classList.toggle('hidden', Gather.appSettings.showSuggestions === false);
}

async function refreshPost(id) {
  if (!id) return null;
  const post = await apiFetch(`/api/posts/${encodeURIComponent(id)}`);
  if (post) upsertPost(post);
  return post;
}

async function loadCommunity() {
  if (!Gather.api.token()) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const me = await apiFetch('/api/auth/me');
    if (!me) return;
    Gather.state.currentUserId = me.id;
    rememberUser(me);
    Gather.renderShell();

    const [site, settings, users, friends, outgoing, posts, communities, notifications, chats] = await Promise.all([
      apiFetch('/api/site').then(value => { rememberSite(value); return value; }),
      apiFetch('/api/settings'),
      apiFetch('/api/users'),
      apiFetch('/api/friends').catch(() => []),
      apiFetch('/api/friends/requests/outgoing').catch(() => []),
      apiFetch('/api/posts').catch(() => []),
      apiFetch('/api/communities').catch(() => []),
      apiFetch('/api/notifications').catch(() => []),
      apiFetch('/api/chats').catch(() => [])
    ]);

    Gather.state.currentUserId = me.id;
    Gather.state.users = users || [];
    rememberUser(me);
    rememberSite(site);
    if (settings) Object.assign(Gather.appSettings, settings);
    Gather.state.friends = (friends || []).map(item => item.friendId);
    Gather.state.outgoingRequests = (outgoing || [])
      .filter(item => item.status === 'pending')
      .map(item => item.toUserId);
    Gather.state.posts = posts || [];
    Gather.state.communities = communities || [];
    Gather.state.notifications = notifications || [];
    Gather.state.chats = (chats || []).map(thread => ({
      id: thread.id,
      participantId: thread.participantId,
      messages: thread.messages || []
    }));

    const selectedId = new URLSearchParams(window.location.search).get('id');
    if (selectedId && !Gather.state.communities.some(community => community.id === selectedId)) {
      const community = await apiFetch(`/api/communities/${encodeURIComponent(selectedId)}`);
      if (community) upsertCommunity(community);
    }

    paintCommunity();
  } catch (error) {
    Gather.applyBranding(Gather.state.site);
    showCommunityError(null, error);
  }
}

async function submitCommunityPost() {
  const textInput = document.querySelector('[data-community-post-text]');
  const text = textInput?.value.trim();
  const notice = document.querySelector('[data-community-media-notice]');
  const community = selectedCommunity();
  if (!text || !community?.id) return;

  const preview = document.querySelector('[data-community-media-preview] img, [data-community-media-preview] video');
  const body = {
    text,
    privacy: 'communities',
    communityId: community.id,
    image: '',
    video: ''
  };
  if (preview instanceof HTMLVideoElement) body.video = preview.src;
  else if (preview?.src) body.image = preview.src;

  const post = await apiFetch('/api/posts', { method: 'POST', body: JSON.stringify(body) });
  if (!post) return;
  upsertPost(post);
  textInput.value = '';
  Gather.clearMediaInput(
    document.querySelector('[data-community-post-image]'),
    '[data-community-media-preview]',
    '[data-community-media-notice]'
  );
  if (notice) notice.textContent = '';
  render();
}

async function runCommunityAction(element, work) {
  if (element.dataset.pending === '1') return;
  element.dataset.pending = '1';
  try {
    await work();
  } catch (error) {
    showCommunityError(element, error);
  } finally {
    delete element.dataset.pending;
  }
}

async function handleCommunityAction(name, element) {
  const postId = element.dataset.postId || element.closest('[data-post-id]')?.dataset.postId;

  if (name === 'toggle-like' || name === 'toggle-repost' || name === 'toggle-bookmark') {
    const action = name === 'toggle-like' ? 'like' : name === 'toggle-repost' ? 'repost' : 'bookmark';
    const post = await apiFetch(`/api/posts/${encodeURIComponent(postId)}/${action}`, { method: 'POST' });
    if (!post) return;
    upsertPost(post);
    render();
    return;
  }

  if (name === 'delete-post') {
    await apiFetch(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
    Gather.state.posts = Gather.state.posts.filter(post => post.id !== postId);
    document.querySelector('[data-post-options-modal]')?.close();
    render();
    return;
  }

  if (name === 'delete-comment') {
    await apiFetch(`/api/comments/${encodeURIComponent(element.dataset.commentId)}`, { method: 'DELETE' });
    await refreshPost(postId);
    render();
    return;
  }

  if (name === 'submit-report') {
    const dialog = element.closest('dialog');
    const report = await apiFetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        postId: dialog?.dataset.postId,
        reason: dialog?.querySelector('[data-report-reason]')?.value || '',
        details: dialog?.querySelector('[data-report-details]')?.value || ''
      })
    });
    if (!report) return;
    dialog?.close();
    return;
  }

  if (name === 'share-to-chat') {
    const dialog = element.closest('dialog');
    const url = new URL(`home.html?post=${encodeURIComponent(dialog?.dataset.postId || '')}`, window.location.href).href;
    const sent = await apiFetch('/api/chats/direct', {
      method: 'POST',
      body: JSON.stringify({ participantId: element.dataset.userId, text: url })
    });
    if (!sent) return;
    const label = element.querySelector('.share-chat-kind');
    if (label) label.textContent = 'Sent';
    return;
  }

  if (name === 'send-request') {
    const userId = element.dataset.userId;
    const request = await apiFetch(`/api/friends/requests/${encodeURIComponent(userId)}`, { method: 'POST' });
    if (!request) return;
    if (request.status === 'pending' && !Gather.state.outgoingRequests.includes(userId)) {
      Gather.state.outgoingRequests.push(userId);
    }
    Gather.renderShell();
    return;
  }

  if (name === 'toggle-community' || name === 'community-join') {
    const communityId = element.dataset.communityId || selectedCommunity()?.id;
    if (!communityId) return;
    const existing = Gather.state.communities.find(item => item.id === communityId) || selectedCommunity();
    if (existing?.ownerId === Gather.state.currentUserId) return;
    const community = await apiFetch(`/api/communities/${encodeURIComponent(communityId)}/join`, { method: 'POST' });
    if (!community) return;
    upsertCommunity(community);
    paintCommunity();
    return;
  }

  if (name === 'submit-community') {
    const form = element.closest('form');
    const nameValue = form?.elements.namedItem('community-name')?.value.trim();
    const notice = form?.querySelector('[data-card-art-notice]');
    if (!nameValue) return;
    const file = form.querySelector('[data-card-art-file]')?.files?.[0];
    let banner = '';
    if (file) {
      try { banner = await Gather.readPhotoFile(file); }
      catch (error) { if (notice) notice.textContent = error.message; return; }
    }
    const community = await apiFetch('/api/communities', {
      method: 'POST',
      body: JSON.stringify({
        name: nameValue,
        description: form.elements.namedItem('community-description')?.value.trim() || '',
        emoji: nameValue.slice(0, 1).toUpperCase(),
        color: '#e1d5f0',
        banner: banner || null
      })
    });
    if (!community) return;
    upsertCommunity(community);
    form.reset();
    const bannerPreview = form.querySelector('[data-card-art-banner]');
    if (bannerPreview) {
      bannerPreview.hidden = true;
      bannerPreview.style.backgroundImage = '';
    }
    form.closest('dialog')?.close();
    paintCommunity();
    return;
  }

  if (name === 'community-post') {
    await submitCommunityPost();
  }
}

async function handleCommunitySubmit(form) {
  const postId = form.dataset.postId || form.closest('[data-post-id]')?.dataset.postId;

  if (form.matches('[data-edit-post-form]')) {
    const text = form.elements.namedItem('edit-text')?.value.trim();
    if (!text) return;
    const post = await apiFetch(`/api/posts/${encodeURIComponent(postId)}`, {
      method: 'PUT',
      body: JSON.stringify({ text })
    });
    if (!post) return;
    upsertPost(post);
    render();
    return;
  }

  if (form.matches('[data-edit-comment-form]')) {
    const text = form.elements.namedItem('edit-text')?.value.trim();
    if (!text) return;
    const comment = await apiFetch(`/api/comments/${encodeURIComponent(form.dataset.commentId)}`, {
      method: 'PUT',
      body: JSON.stringify({ text })
    });
    if (!comment) return;
    await refreshPost(postId);
    render();
    return;
  }

  if (form.matches('[data-comment-form]')) {
    const text = form.elements.namedItem('comment')?.value.trim();
    if (!text || !postId) return;
    const comment = await apiFetch(`/api/comments/post/${encodeURIComponent(postId)}`, {
      method: 'POST',
      body: JSON.stringify({ text, parentId: form.dataset.replyParent || null })
    });
    if (!comment) return;
    await refreshPost(postId);
    render();
  }
}

document.addEventListener('click', event => {
  const element = event.target.closest('[data-action]');
  if (!element || !communityActions.has(element.dataset.action)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  runCommunityAction(element, () => handleCommunityAction(element.dataset.action, element));
}, true);

document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches('[data-comment-form], [data-edit-comment-form], [data-edit-post-form]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleCommunitySubmit(form).catch(error => showCommunityError(form, error));
}, true);

loadCommunity();

