/**
 * Client-side navigation without full page reload.
 * App.js listens for 'app:navigate' + popstate.
 */
export function navigate(to) {
  if (!to) return;

  // Absolute path → update browser URL
  if (to.startsWith('/')) {
    const current = window.location.pathname + window.location.search;
    if (current !== to) {
      window.history.pushState({}, '', to);
    }
  }

  window.dispatchEvent(new CustomEvent('app:navigate', { detail: { to } }));
}

export function pathToPage(pathWithQuery) {
  const path = (pathWithQuery || '/').split('?')[0];
  if (path.startsWith('/admin') || path.startsWith('/store') || path.startsWith('/track')) {
    return path;
  }
  if (path === '/' || path === '') return 'order';
  return path.replace(/^\//, '') || 'order';
}
