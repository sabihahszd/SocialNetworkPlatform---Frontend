function render() {
  const posts = Gather.state.posts
    .filter(post => Gather.canSee(post) && post.bookmarks.includes(Gather.state.currentUserId))
    .sort(Gather.byNewest);
  document.querySelectorAll('[data-feed-list]').forEach(container => {
    container.innerHTML = posts.map(post => Gather.renderPost(post)).join('');
  });
  document.querySelector('[data-empty-feed]')?.classList.toggle('hidden', posts.length > 0);
}

Gather.start({ render });
