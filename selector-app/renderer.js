let themes = {};
const activeToasts = [];
const themeGridEl = document.getElementById('theme-grid');
const previewContainer = document.getElementById('preview-container');
const cycleBtn = document.getElementById('cycle-btn');
const applyBtn = document.getElementById('apply-btn');

let selectedTheme = null;
let selectedCardEl = null;

// Placeholder SVG data URI used when preview is missing
const PLACEHOLDER_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#0b0b12"/><g fill="#2e2e4e"><rect x="48" y="48" width="544" height="264" rx="8"/></g><text x="50%" y="52%" fill="#6b6f85" font-size="18" font-family="Segoe UI, Arial" text-anchor="middle">No preview</text></svg>`
);

// Async init to use the bridged async API
async function init() {
  // First, check IPC ping to confirm main is reachable
  try {
    const ping = await window.diagnostics.ping();
    Utils.sendMessage('success', 'Connected to theme manager backend', 2);
  } catch (e) {
    Utils.sendMessage('error', 'Error: Unable to connect to theme manager backend', 0);
  }
  // Retry get-themes a few times in case main process hasn't registered handlers yet.
  const maxAttempts = 6;
  const delayMs = 200;
  let attempt = 0;
  let loaded = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      Utils.sendMessage('info', `Loading themes... (attempt ${attempt})`, 1);
      loaded = await window.themeAPIAsync.getThemes();
      if (loaded) break;
    } catch (e) {
      Utils.sendMessage('error', `Error loading themes: ${e && e.message ? e.message : e}`, 3);
    }
    // small backoff
    await new Promise(r => setTimeout(r, delayMs));
  }

  if (!loaded || loaded.error) {
    const msg = loaded && loaded.error ? loaded.error : 'No themes found or handler missing';
    Utils.sendMessage('error', 'Error loading themes: ' + msg);
    return;
  }

  themes = loaded;
  const themeNames = Object.keys(themes);
  for (const themeName of themeNames) {
    const info = themes[themeName];
    const card = await createThemeCard(themeName, info);
    themeGridEl.append(card);
  }
}

init();

async function createThemeCard(themeName, info) {
  const card = document.createElement('div');
  card.className = 'theme-card';
  card.setAttribute('data-theme', themeName);

  // Thumbnail (with blurred scaled background). Use a wrapper so we can place a scaled, blurred background behind the image.
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'thumb-wrap';
  const thumbBg = document.createElement('div');
  thumbBg.className = 'thumb-bg';
  let thumbImg = document.createElement('img');
  thumbImg.className = 'thumb-img';

  // Ask preload for preview paths (safe from renderer)
  const previews = await window.themeAPIAsync.getPreviewPaths(themeName) || [];
  let thumbIndex = 0;
  if (previews.length) {
    thumbImg.src = previews[0];
    // set background to same image (will be scaled and blurred via CSS)
    thumbBg.style.backgroundImage = `url('${previews[0]}')`;
  } else {
    thumbImg.src = PLACEHOLDER_SVG;
    thumbBg.style.backgroundImage = `url('${PLACEHOLDER_SVG}')`;
  }

  thumbWrap.appendChild(thumbBg);
  thumbWrap.appendChild(thumbImg);
  card.appendChild(thumbWrap);

  // If multiple previews, cycle the thumbnail every 5s with sliding animation
  if (previews.length > 1) {
    const slideInterval = 5000;
    const doSlide = () => {
      try {
        const nextIndex = (thumbIndex + 1) % previews.length;
        const nextSrc = previews[nextIndex];
        // prepare next image element
        const nextImg = document.createElement('img');
        nextImg.className = 'thumb-img next';
        nextImg.src = nextSrc;
        // ensure next image is positioned to the right (css .next has translateX(100%))
        thumbWrap.appendChild(nextImg);
        // set background to next (darker blurred backdrop)
        thumbBg.style.backgroundImage = `url('${nextSrc}')`;

        // force reflow then animate
        // both elements use transform; add slide class to enable transition
        void nextImg.offsetWidth;
        nextImg.classList.add('slide');
        thumbImg.classList.add('slide');
        // move current left and next into view
        thumbImg.style.transform = 'translateX(-100%)';
        nextImg.style.transform = 'translateX(0)';

        // after transition, remove old image and set references
        const cleanup = () => {
          thumbImg.remove();
          // nextImg becomes the primary
          nextImg.classList.remove('next');
          nextImg.classList.remove('slide');
          nextImg.style.transform = 'translateX(0)';
          // update reference
          thumbImg = nextImg; // eslint-disable-line no-unused-vars
          thumbIndex = nextIndex;
          nextImg.removeEventListener('transitionend', cleanup);
        };
        nextImg.addEventListener('transitionend', cleanup);
      } catch (e) {
        Utils.sendMessage('error', 'Thumbnail slide error: ' + e, 5);
      }
    };
    const intervalId = setInterval(doSlide, slideInterval);
    card._thumbInterval = intervalId;
  }

  // Body: title, description, tags
  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = (info && info.meta && info.meta.name) ? info.meta.name : themeName;
  body.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = (info && info.meta && info.meta.description) ? info.meta.description : '';
  body.appendChild(desc);

  // Tags
  if (info && info.meta && Array.isArray(info.meta.tags)) {
    const tagWrap = document.createElement('div');
    info.meta.tags.forEach(t => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = t;
      tagWrap.appendChild(pill);
    });
    body.appendChild(tagWrap);
  }

  card.appendChild(body);

  // Footer with repo link and version (version shown bottom-right in grey)
  const footer = document.createElement('div');
  footer.className = 'meta-footer';
  const left = document.createElement('div');
  left.className = 'meta-left';
  // Authors avatars (if present)
  if (info && info.meta && info.meta.authors && typeof info.meta.authors === 'object') {
    const avatars = document.createElement('div');
    avatars.style.display = 'flex';
    avatars.style.gap = '6px';
    let count = 0;
    for (const [name, data] of Object.entries(info.meta.authors)) {
      if (count++ > 3) break;
      if (data && data['github-pfp-link']) {
        const img = document.createElement('img');
        img.src = data['github-pfp-link'];
        img.className = 'author-avatar';
        img.title = name;
        avatars.appendChild(img);
      }
    }
    left.appendChild(avatars);
  }
  if (info && info.meta && info.meta.repository && info.meta.repository !== 'Null') {
    const a = document.createElement('a');
    a.className = 'meta-repo';
    a.href = info.meta.repository;
    a.target = '_blank';
    a.textContent = 'Repository';
    left.appendChild(a);
  }
  // Apply button removed - clicking card opens theme page

  footer.appendChild(left);

  const ver = document.createElement('div');
  ver.className = 'version';
  ver.textContent = (info && info.meta && info.meta.version) ? `v${info.meta.version}` : '';
  footer.appendChild(ver);

  card.appendChild(footer);

  // Error badge when manifest had parse errors
  if (info && info.error) {
    const badge = document.createElement('div');
    badge.className = 'error-badge';
    badge.textContent = 'manifest error';
    badge.title = info.error;
    card.appendChild(badge);
  }

  // Interaction: click opens theme page
  card.addEventListener('click', (ev) => {
    ev.stopPropagation();
    window.themeWindow.openThemePage(themeName)
      .then(res => {
        if (res && res.error) Utils.sendMessage('error', 'Failed to open theme page: ' + res.error, 5);
      })
      .catch(err => Utils.sendMessage('error', 'Error opening theme page: ' + err, 5));
  });

  return card;
}

async function showPreview(themeName) {
  previewContainer.innerHTML = '';  // clear
  // Use preload helper to resolve preview image file:// or data: URIs
  const previewPaths = await window.themeAPI.getPreviewPaths(themeName) || [];
  Utils.sendMessage('info', `Loaded ${previewPaths.length} preview images for ${themeName}`, 2);
  if (previewPaths.length) {
    previewPaths.forEach(p => {
      const img = document.createElement('img');
      img.src = p;
      img.className = 'theme-preview';
      previewContainer.append(img);
    });
  } else {
    previewContainer.textContent = '(No preview images defined)';
  }
}

function applyTheme(themeName) {
  window.themeAPI.applyTheme(themeName)
    .then(async result => {
      Utils.sendMessage('success', `Applied theme: ${themeName}`, 3);

      // If main sent handshake event, don't process here - event listener handles it
      if (result && result.handshake_sent) {
        Utils.sendMessage('info', 'Waiting for workshop item to download...', 0);
        return;
      }

      // If the backend signals a need for sub-theme selection, open the theme page so
      // the user can pick a sub-theme (the page will call applyTheme again with theme/sub)
      if (result && result.needs_sub) {
        // If the main process indicates sub-theme selection is required but
        // a representative sub-theme was discovered when scanning themes
        // (stored as __repSub), auto-apply that sub to improve UX.
        try {
          const rep = themes && themes[result.theme] && themes[result.theme].__repSub;
          if (rep) {
            // auto-apply the representative sub-theme
            await window.themeAPI.applyTheme(`${result.theme}/${rep}`);
            return;
          }
        } catch (e) {
          Utils.sendMessage('error', 'Auto-apply repSub failed: ' + (e.message || e), 3);
        }

        try {
          await window.themeWindow.openThemePage(result.theme);
        } catch (e) {
          Utils.sendMessage('error', 'Failed to open theme page for sub selection: ' + (e.message || e), 3);
          Utils.sendMessage('info', 'Please select a sub-theme from the theme page.');
        }
        return;
      }

      // If backend signals needs_workshop, the promise is intentionally left pending
      // and the onHandshake event listener will handle the UI (overlay prompt)
      // So we should not reach here for needs_workshop cases
      if (result && result.needs_workshop) {
        Utils.sendMessage('debug', 'applyTheme: needs_workshop in result (should be handled by event listener)', 3);
        return;
      }
    })
    .catch(err => {
      Utils.sendMessage('error', 'applyTheme error: ' + (err.message || err), 8);
      Utils.sendMessage('error', 'Failed to apply theme: ' + (err.message || err), 8);
    });
}

function showWaitingOverlay(text) {
  let el = document.getElementById('waiting-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'waiting-overlay';
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.background = 'rgba(0,0,0,0.6)';
    el.style.zIndex = '9999';
    el.style.color = '#fff';
    el.style.fontSize = '18px';
    document.body.appendChild(el);
  }
  el.textContent = text;
}

function hideWaitingOverlay() {
  const el = document.getElementById('waiting-overlay'); if (el) el.remove();
}

// Listen for workshop-found events from main
if (window.themeEvents && typeof window.themeEvents.onWorkshopFound === 'function') {
  window.themeEvents.onWorkshopFound((data) => {
    Utils.sendMessage('debug', 'workshop-found: ' + JSON.stringify(data));
    hideWaitingOverlay();
    Utils.sendMessage('success', `Workshop item ${data.workshopId} downloaded — applying theme ${data.theme}/${data.sub}`);
  });
}

// Listen for streaming theme status messages (e.g. theme:wallpaper: OK/FAIL)
if (window.themeEvents && typeof window.themeEvents.onThemeStatus === 'function') {
  window.themeEvents.onThemeStatus((data) => {
    try {
      Utils.sendMessage('debug', 'theme-status: ' + JSON.stringify(data));
      try { showDebugBanner && showDebugBanner(`status: ${data && data.line ? data.line : JSON.stringify(data)}`); } catch (e) { }
      // If a wallpaper OK message arrives, hide waiting overlay
      if (data && typeof data.line === 'string') {
        if (data.line.toLowerCase().includes('theme:wallpaper: ok')) {
          hideWaitingOverlay();
          // small non-blocking toast
          Utils.sendMessage('success', 'Wallpaper applied');
        } else if (data.line.toLowerCase().includes('theme:wallpaper: fail') || data.line.toLowerCase().includes('theme:wallpaper: skip')) {
          hideWaitingOverlay();
          Utils.sendMessage('warn', data.line);
        } else {
          // general status: show briefly
          Utils.sendMessage('info', data.line, 3);
        }
      }
    } catch (e) { Utils.sendMessage('error', 'theme-status handler err: ' + (e.message || e)); }
  });
}

// Listen for explicit handshake JSON forwarded from main (ensures renderer sees needs_workshop immediately)
Utils.sendMessage('debug', 'RENDERER: Setting up onHandshake listener...');
Utils.sendMessage('debug', 'RENDERER: window.themeEvents = ' + JSON.stringify(window.themeEvents));
Utils.sendMessage('debug', 'RENDERER: typeof window.themeEvents.onHandshake = ' + typeof window.themeEvents?.onHandshake);

if (window.themeEvents && typeof window.themeEvents.onHandshake === 'function') {
  Utils.sendMessage('debug', 'RENDERER: Registering onHandshake listener - READY');
  window.themeEvents.onHandshake((data) => {
    try {
      Utils.sendMessage('debug', 'RENDERER: *** onHandshake callback FIRED with data: ' + JSON.stringify(data, null, 2));
      Utils.sendMessage('debug', 'theme-handshake: ' + JSON.stringify(data));
      try { showDebugBanner(`handshake: ${JSON.stringify(data)}`); } catch (e) { }
      if (data && data.needs_workshop) {
        Utils.sendMessage('debug', 'RENDERER: Creating workshop prompt overlay...');
        Utils.sendMessage('debug', 'RENDERER: Workshop ID: ' + (data.workshop_id || data.workshopId));
        Utils.sendMessage('debug', 'RENDERER: Theme: ' + data.theme + ', Sub: ' + data.sub);

        // remove any existing prompt
        const existing = document.getElementById('workshop-prompt');
        if (existing) existing.remove();

        // compute commonly used values
        const steamUrl = data.steam_url || data.steamUrl || data.link;
        const workshopId = data.workshop_id || data.workshopId;
        const themeCommand = data.theme_select_command || `${data.theme}/${data.sub || ''}`;

        // build overlay + panel
        const overlay = document.createElement('div');
        overlay.id = 'workshop-prompt';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.top = '0';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = 10001;
        overlay.style.pointerEvents = 'none';

        const panel = document.createElement('div');
        panel.style.pointerEvents = 'auto';
        panel.style.margin = '12px';
        panel.style.background = 'linear-gradient(180deg, rgba(16,16,24,0.95), rgba(8,8,12,0.95))';
        panel.style.color = '#fff';
        panel.style.padding = '16px 20px';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
        panel.style.maxWidth = '500px';

        const title = document.createElement('div');
        title.style.fontSize = '18px';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '12px';
        title.textContent = 'Wallpaper Not Found';

        const msg = document.createElement('div');
        msg.style.marginBottom = '16px';
        msg.style.lineHeight = '1.5';
        msg.innerHTML = `This sub-theme requires a Wallpaper Engine wallpaper that is not installed.<br><br><strong>What would you like to do?</strong>`;

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '10px';
        btnRow.style.flexWrap = 'wrap';

        // Buttons
        const openBtn = document.createElement('button');
        openBtn.textContent = 'Open Steam Workshop';
        openBtn.className = 'subtheme-apply-btn';

        const disableBtn = document.createElement('button');
        disableBtn.textContent = 'Disable Wallpaper';
        disableBtn.className = 'subtheme-disable-btn';

        const changeBtn = document.createElement('button');
        changeBtn.textContent = 'Choose Different';
        changeBtn.className = 'subtheme-change-btn';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.className = 'subtheme-decline-btn';

        // wire handlers
        openBtn.addEventListener('click', async () => {
          Utils.sendMessage('debug', 'Opening Steam Workshop URL: ' + steamUrl + ', themeCommand: ' + themeCommand);
          try {
            if (steamUrl) await window.themeAPI.openExternal(steamUrl);
            else Utils.sendMessage('warn', 'No Steam URL provided for workshop item', 3);
          } catch (e) {
            Utils.sendMessage('error', 'openExternal failed: ' + (e.message || e), 3);
            Utils.sendMessage('error', 'Failed to open Steam: ' + (e.message || e), 3);
          }

          overlay.remove();
          showWaitingOverlay(`Waiting for workshop item ${workshopId} to download...\nClick to cancel`);

          // Add click handler to cancel waiting
          const waitOverlay = document.getElementById('waiting-overlay');
          if (waitOverlay) {
            waitOverlay.style.cursor = 'pointer';
            const cancelHandler = () => {
              hideWaitingOverlay();
              waitOverlay.removeEventListener('click', cancelHandler);
            };
            waitOverlay.addEventListener('click', cancelHandler);
          }

          try {
            const watch = await window.themeAPI.watchWorkshop(workshopId, data.theme, data.sub || '');
            if (watch && watch.id) {
              Utils.sendMessage('debug', `Started watching for workshop item ${workshopId}`);
            }
          } catch (e) {
            Utils.sendMessage('error', 'watchWorkshop failed: ' + (e.message || e), 3);
            hideWaitingOverlay();
            Utils.sendMessage('error', 'Failed to watch workshop item', 3);
          }
        });

        disableBtn.addEventListener('click', async () => {
          try {
            // Mark to skip workshop (creates skip file)
            await window.themeAPI.markSkipWorkshop(data.theme, data.sub || '');
            // Also disable in manifest permanently
            const result = await window.themeAPI.disableSubWallpaper(data.theme, data.sub || '');
            if (result && result.ok) {
              Utils.sendMessage('success', 'Wallpaper permanently disabled for this sub-theme');
            } else {
              Utils.sendMessage('success', 'Wallpaper disabled (skip file created)');
            }
          } catch (e) {
            Utils.sendMessage('error', 'disableSubWallpaper failed: ' + (e.message || e), 3);
            Utils.sendMessage('error', 'Failed to disable wallpaper: ' + (e.message || e), 3);
          }
          overlay.remove();
        });

        changeBtn.addEventListener('click', async () => {
          overlay.remove();
          Utils.sendMessage('info', 'Custom wallpaper selection - Coming soon!');
        });

        closeBtn.addEventListener('click', () => {
          overlay.remove();
        });

        // assemble UI
        btnRow.appendChild(openBtn);
        btnRow.appendChild(disableBtn);
        btnRow.appendChild(changeBtn);
        btnRow.appendChild(closeBtn);

        panel.appendChild(title);
        panel.appendChild(msg);
        panel.appendChild(btnRow);

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
      }
    } catch (e) { Utils.sendMessage('error', 'theme-handshake handler err: ' + (e.message || e)); }
  });
}

// Track active toast chips

// Initialize debug configuration
// window.debugMode: Controls which toasts are displayed
//   - 'verbose': Show all toasts (debug, info, success, warn, error)
//   - 'normal': Show user-facing toasts (info, success, warn, error) - hide debug
//   - 'minimal': Show important toasts only (success, error)
//   - 'silent': No toasts displayed
if (typeof window.debugMode === 'undefined') {
  window.debugMode = 'normal';
}

// window.debugLogLevel: Controls console logging verbosity
//   - 'debug': Log everything including debug messages
//   - 'info': Log info and below (info, success, warn, error)
//   - 'warn': Log warnings and errors only
//   - 'error': Log errors only
//   - 'none': No console logging
if (typeof window.debugLogLevel === 'undefined') {
  window.debugLogLevel = 'info';
}

// window.debugConsole: Master switch for console output
if (typeof window.debugConsole === 'undefined') {
  window.debugConsole = true;
}

// Handle settings-missing signal to prompt user to configure WE paths
if (window.themeEvents && typeof window.themeEvents.onSettingsMissing === 'function') {
  window.themeEvents.onSettingsMissing(async (info) => {
    Utils.sendMessage('debug', 'settings-missing: ' + JSON.stringify(info));
    const proceed = confirm('Wallpaper Engine settings appear missing or invalid. Open settings to configure now?');
    if (!proceed) return;
    // simple flow: ask user to select Steam "steamapps" folder
    const folder = await window.themeAPI.selectFolder();
    if (!folder) return Utils.sendMessage('warn', 'No folder selected');
    // Expect user to select the parent folder that contains \steamapps
    // Build settings assuming user selected either the steamapps folder or the Steam library root
    const settings = {};
    if (folder.toLowerCase().endsWith('steamapps')) {
      settings.WE_Workshop = pathJoin(folder, 'workshop', 'content', '431960');
      settings.WE_Exe = pathJoin(folder, 'common', 'wallpaper_engine', 'wallpaper64.exe');
    } else {
      // assume user selected the Steam library folder (parent of 'steamapps')
      settings.WE_Workshop = pathJoin(folder, 'steamapps', 'workshop', 'content', '431960');
      settings.WE_Exe = pathJoin(folder, 'steamapps', 'common', 'wallpaper_engine', 'wallpaper64.exe');
    }
    await window.themeAPI.setSettings(settings);
    Utils.sendMessage('success', 'Settings saved. If Wallpaper Engine files are present the selector will now detect them.');
  });
}

// small helpers used above
function pathJoin() { return Array.from(arguments).join('\\'); }

// Cycle button handler
if (cycleBtn) {
  cycleBtn.addEventListener('click', () => {
    window.themeAPI.cycleTheme()
      .then(out => {
        Utils.sendMessage('success', 'Cycled theme\n' + (out || ''));
      })
      .catch(err => {
        Utils.sendMessage('error', 'Failed to cycle theme: ' + err);
      });
  });
}

// Apply selected button handler
if (applyBtn) {
  applyBtn.addEventListener('click', () => {
    if (!selectedTheme) {
      Utils.sendMessage('warn', 'No theme selected');
      return;
    }
    applyTheme(selectedTheme);
  });
}

// Temporary debug banner to make incoming events visible in the UI without opening DevTools
function showDebugBanner(text) {
  try {
    let b = document.getElementById('debug-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'debug-banner';
      b.style.position = 'fixed';
      b.style.left = '12px';
      b.style.top = '12px';
      b.style.background = 'rgba(0,0,0,0.72)';
      b.style.color = '#fff';
      b.style.padding = '8px 10px';
      b.style.borderRadius = '6px';
      b.style.zIndex = '11000';
      b.style.fontSize = '12px';
      b.style.maxWidth = '60vw';
      b.style.overflow = 'hidden';
      b.style.textOverflow = 'ellipsis';
      b.style.whiteSpace = 'nowrap';
      document.body.appendChild(b);
    }
    b.textContent = text;
    clearTimeout(b._hideTimer);
    b._hideTimer = setTimeout(() => { try { b.textContent = ''; } catch (e) { } }, 15000);
  } catch (e) { Utils.sendMessage('error', 'showDebugBanner error: ' + (e.message || e)); }
}

// ===== TAB NAVIGATION =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Load editor content when switching to editor tab
    if (tabName === 'editor' && typeof window.initEditor === 'function') {
      window.initEditor();
    }
  });
});

// ===== EDITOR TAB (loaded from Tab-Editor.js) =====
// Editor functionality has been moved to Tab-Editor.js for better code organization

// ===== OLD SIMPLE EDITOR (DEPRECATED) =====
async function loadEditorContent() {
  const editorContent = document.getElementById('editor-content');
  if (!editorContent) return;

  try {
    // Get all themes
    const loaded = await window.themeAPIAsync.getThemes();
    if (!loaded || loaded.error) {
      editorContent.innerHTML = '<p style="color: #ff6b6b;">Error loading themes</p>';
      return;
    }

    const themeNames = Object.keys(loaded);
    let html = '';

    for (const themeName of themeNames) {
      const theme = loaded[themeName];
      if (!theme.subs || theme.subs.length === 0) continue;

      html += `
        <div class="editor-section">
          <h3>${theme.meta?.name || themeName}</h3>
      `;

      for (const sub of theme.subs) {
        const hasWallpaper = sub.manifest && sub.manifest['wallpaper-engine'];
        if (!hasWallpaper) continue;

        const wallpaperEnabled = sub.manifest['wallpaper-engine'].enabled !== false;
        const statusClass = wallpaperEnabled ? 'enabled' : 'disabled';
        const statusText = wallpaperEnabled ? 'Wallpaper Enabled' : 'Wallpaper Disabled';

        html += `
          <div class="sub-theme-item" data-theme="${themeName}" data-sub="${sub.name}">
            <div class="sub-theme-info">
              <div class="sub-theme-name">${sub.meta?.name || sub.name}</div>
              <div class="sub-theme-status ${statusClass}">${statusText}</div>
            </div>
            <div class="sub-theme-actions">
              ${wallpaperEnabled
            ? `<button class="action-btn danger" onclick="disableWallpaper('${themeName}', '${sub.name}')">Disable Wallpaper</button>`
            : `<button class="action-btn primary" onclick="enableWallpaper('${themeName}', '${sub.name}')">Re-enable Wallpaper</button>`
          }
            </div>
          </div>
        `;
      }

      html += '</div>';
    }

    if (!html) {
      html = '<p style="color: #9aa0c0; text-align: center; padding: 40px;">No themes with wallpapers found</p>';
    }

    editorContent.innerHTML = html;
  } catch (e) {
    Utils.sendMessage('error', 'Error loading editor content: ' + (e.message || e));
    editorContent.innerHTML = '<p style="color: #ff6b6b;">Error loading editor content</p>';
  }
}

// Global functions for button onclick handlers
window.enableWallpaper = async function (theme, sub) {
  try {
    const result = await window.themeAPI.enableSubWallpaper(theme, sub);
    if (result && result.ok) {
      Utils.sendMessage('success', `Wallpaper re-enabled for ${sub}`);
      loadEditorContent(); // Reload to update UI
    } else {
      Utils.sendMessage('error', `Failed to re-enable: ${result?.error || 'unknown error'}`);
    }
  } catch (e) {
    Utils.sendMessage('error', `Error: ${e.message}`);
  }
};

window.disableWallpaper = async function (theme, sub) {
  try {
    const result = await window.themeAPI.disableSubWallpaper(theme, sub);
    if (result && result.ok) {
      Utils.sendMessage('success', `Wallpaper disabled for ${sub}`);
      loadEditorContent(); // Reload to update UI
    } else {
      Utils.sendMessage('error', `Failed to disable: ${result?.error || 'unknown error'}`);
    }
  } catch (e) {
    Utils.sendMessage('error', `Error: ${e.message}`);
  }
};
