let feedFilter = 'friends';

const dateLabel = document.querySelector('.page-heading .eyebrow');
if (dateLabel) {
  dateLabel.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
}

function visiblePosts() {
  let posts = Gather.state.posts.filter(Gather.canSee);
  if (feedFilter === 'following') {
    posts = posts.filter(post => post.authorId !== Gather.state.currentUserId && Gather.state.following.includes(post.authorId));
  }
  return posts.sort(Gather.byNewest);
}

function renderAudience() {
  document.querySelectorAll('#post-privacy').forEach(select => {
    const selected = select.value;
    const joined = Gather.state.communities.filter(Gather.isCommunityMember);
    select.innerHTML = `<option value="public">Everyone</option>${joined.map(community => `<option value="community:${Gather.escapeHTML(community.id)}">${Gather.escapeHTML(community.emoji)} ${Gather.escapeHTML(community.name)}</option>`).join('')}`;
    select.value = [...select.options].some(option => option.value === selected) ? selected : 'public';
  });
}

function renderPostDetail() {
  const detail = document.querySelector('[data-home-post-detail]');
  if (!detail) return;
  const requestedId = new URLSearchParams(window.location.search).get('post');
  const feedView = document.querySelector('[data-home-feed-view]');
  const content = detail.querySelector('[data-home-post-detail-content]');
  const notFound = detail.querySelector('[data-home-post-not-found]');
  const heading = detail.querySelector('[data-home-post-heading]');
  feedView?.classList.toggle('hidden', !!requestedId);
  detail.classList.toggle('hidden', !requestedId);
  if (!requestedId) {
    if (content) content.innerHTML = '';
    notFound?.classList.add('hidden');
    document.title = 'Gather — your people, in one place';
    return;
  }
  const post = Gather.state.posts.find(item => item.id === requestedId && Gather.canSee(item));
  const source = feedView?.querySelector(`[data-post-id="${CSS.escape(requestedId)}"]`) || document.querySelector('template[data-post-templates]')?.content.querySelector(`[data-post-id="${CSS.escape(requestedId)}"]`);
  const stored = sessionStorage.getItem(`gather.post.${requestedId}`);
  if (post && content) content.innerHTML = Gather.renderPost(post);
  else if (source && content) {
    const clone = source.cloneNode(true);
    clone.hidden = false;
    content.replaceChildren(clone);
  } else if (stored && content) {
    content.innerHTML = stored;
    const restored = content.querySelector('.post-card');
    if (restored) restored.hidden = false;
  } else if (content) content.innerHTML = '';
  const found = Boolean(post || source || stored);
  notFound?.classList.toggle('hidden', found);
  if (heading) heading.textContent = found ? 'Post and replies' : 'Post not found';
  const name = post ? Gather.userById(post.authorId).name : content?.querySelector('.post-author strong')?.textContent;
  document.title = found ? `Post by ${name || 'Gather'} — Gather` : 'Post not found — Gather';
}

function render() {
  const user = Gather.currentUser();
  const composer = document.querySelector('#post-text');
  if (composer && user && document.activeElement !== composer) {
    composer.placeholder = `What's on your mind, ${user.name.split(' ')[0]}?`;
  }
  const posts = visiblePosts();
  document.querySelectorAll('[data-feed-list]').forEach(container => {
    container.innerHTML = posts.map(post => Gather.renderPost(post)).join('');
  });
  document.querySelector('[data-empty-feed]')?.classList.toggle('hidden', posts.length > 0);
  renderAudience();
  renderPostDetail();
}

Gather.start({
  render,
  bind() {
    const applyFeed = () => {
      document.querySelectorAll('[data-feed]').forEach(item => item.classList.toggle('active', item.dataset.feed === feedFilter));
      document.querySelectorAll('[data-feed-list] .post-card').forEach(card => {
        card.hidden = feedFilter === 'friends' && card.dataset.source !== 'friends';
      });
    };
    applyFeed();
    renderPostDetail();
    document.querySelectorAll('[data-feed]').forEach(tab => {
      tab.addEventListener('click', () => {
        feedFilter = tab.dataset.feed;
        applyFeed();
      });
    });
  },
  action(name) {
    if (name !== 'create-post') return;
    const textInput = document.querySelector('#post-text');
    const text = textInput?.value.trim();
    if (!text) return;
    const privacySelect = document.querySelector('#post-privacy');
    const privacyLabel = privacySelect?.selectedOptions?.[0]?.textContent?.trim() || 'Everyone';
    const preview = document.querySelector('[data-post-media-preview] img, [data-post-media-preview] video');
    const image = preview?.src ? `<img class="post-image" src="${Gather.escapeHTML(preview.src)}" alt="Photo you attached">` : '';
    const card = document.createElement('article');
    card.className = 'post-card';
    card.dataset.source = 'friends';
    const postId = `local-${Date.now()}`;
    card.dataset.postId = postId;
    const user = Gather.currentUser();
    const identity = user
      ? `${Gather.avatar(user)}<div class="post-author"><strong>${Gather.escapeHTML(user.name)}</strong><span class="handle">@${Gather.escapeHTML(user.username)}</span>`
      : '<span class="avatar"></span><div class="post-author"><strong></strong><span class="handle"></span>';
    card.innerHTML = `<div class="post-header">${identity}<span class="post-context"><span class="context-icon">◉</span>${Gather.escapeHTML(privacyLabel)} · just now</span></div><button class="icon-button post-menu" type="button" data-action="post-options" aria-label="Post options">···</button></div><p class="post-text">${Gather.escapeHTML(text)}</p>${image}<div class="post-actions"><button class="post-action" type="button" data-action="toggle-like" aria-label="Like post"><i class="fa-regular fa-heart"></i><span class="action-count">0</span></button><button class="post-action" type="button" data-action="toggle-repost" aria-label="Repost"><i class="fa-solid fa-retweet"></i><span class="action-count">0</span></button><button class="post-action" type="button" data-action="open-post" data-post-id="${postId}" aria-label="Open replies"><i class="fa-regular fa-comment"></i><span class="action-count">0</span></button><button class="post-action" type="button" data-action="toggle-bookmark" aria-label="Save post"><i class="fa-regular fa-bookmark"></i><span class="action-count">0</span></button><button class="post-action" type="button" data-action="share-post" aria-label="Share post"><i class="fa-solid fa-share-nodes"></i></button></div><form class="comment-form" data-comment-form><input name="comment" aria-label="Write a reply" placeholder="Add a thoughtful reply..." maxlength="240" required><button type="submit">Reply</button></form>`;
    document.querySelector('[data-feed-list]')?.prepend(card);
    textInput.value = '';
    Gather.clearMediaInput(document.querySelector('#post-image'), '[data-post-media-preview]', '[data-post-media-notice]');
  }
});
