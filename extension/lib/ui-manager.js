/**
 * UI Manager - Handles loading overlays and other visual feedback
 */

export function showLoadingOverlay(message = 'Refreshing Pools...') {
  // Remove existing if any
  hideLoadingOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'blackhole-loading-overlay';
  overlay.innerHTML = `
    <div class="loading-spinner-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">${message}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

export function hideLoadingOverlay() {
  const overlay = document.getElementById('blackhole-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.remove();
      }
    }, 300);
  }
}
