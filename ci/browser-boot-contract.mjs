/** QA-only readiness predicate: decoration or an install prompt is not app boot. */
export function applicationBootState() {
  const visible = node => {
    if (!(node instanceof HTMLElement) || !node.isConnected || node.hidden) return false
    const style = getComputedStyle(node)
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0
  }
  const enabled = node => visible(node) && !node.matches(':disabled,[aria-disabled="true"]')
  const root = document.querySelector('#app')
  if (!root) return false
  const create = root.querySelector('[data-action="create-athlete"]')
  if (create) {
    const input = root.querySelector('#onboard-name')
    return enabled(create) && input instanceof HTMLInputElement && enabled(input) && !input.readOnly
      ? 'first-run athlete form' : false
  }
  const shell = root.querySelector('.app-shell')
  const main = shell?.querySelector('main')
  const home = shell?.querySelector('nav [href="#/home"]')
  const train = shell?.querySelector('nav [href="#/train"]')
  const content = main && [...main.children].some(node => visible(node) && Boolean(node.textContent?.trim()))
  return visible(shell) && visible(main) && enabled(home) && enabled(train) && content
    ? 'application content and navigation' : false
}
