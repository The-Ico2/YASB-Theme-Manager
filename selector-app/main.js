const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { pathToFileURL } = require('url');

// Helper to send toast messages to renderer
function sendToast(text, type = 'debug', duration = 4) {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length > 0) {
    for (const win of allWindows) {
      if (win && win.webContents && !win.webContents.isDestroyed()) {
        try {
          win.webContents.send('sendMessage', {type, text, duration });
        } catch (e) {
          // Fallback to console if executeJavaScript fails
          console.log(`[${type.toUpperCase()}] ${text}`);
        }
      }
    }
  } else {
    // No window available, use console as fallback
    console.log(`[${type.toUpperCase()}] ${text}`);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // Remove the default application menu (File/Edit/View/Window/Help)
  // try { Menu.setApplicationMenu(null); } catch (e) { console.warn('Failed to remove app menu', e); }

  // Hide the menu bar on Windows/Linux so Alt won't reveal the menu unexpectedly
  // try { win.setMenuBarVisibility(true); win.setAutoHideMenuBar(false); } catch (e) {}
  win.loadFile('index.html');
  
  // Poll for workshop-prompt.json file every 2 seconds
  const checkWorkshopPrompt = () => {
    const promptFile = path.join(__dirname, '..', 'workshop-prompt.json');
    sendToast('main: Checking for workshop prompt file at: ' + promptFile + ', exists: ' + fs.existsSync(promptFile), 'debug');
    if (fs.existsSync(promptFile)) {
      try {
        const promptData = fs.readFileSync(promptFile, 'utf8');
        const workshopData = JSON.parse(promptData);
        sendToast('main: Found workshop prompt file with data: ' + JSON.stringify(workshopData), 'debug');
        
        // Delete the file so it's only processed once
        fs.unlinkSync(promptFile);
        sendToast('main: Deleted workshop prompt file', 'debug');
        
        // Send to renderer only if webContents is ready
        if (win && win.webContents && !win.webContents.isDestroyed()) {
          sendToast('main: Sending theme-handshake event to renderer', 'debug');
          win.webContents.send('theme-handshake', workshopData);
          
          // Focus the window
          if (win.isMinimized()) win.restore();
          win.focus();
        } else {
          sendToast('main: Window webContents not ready, cannot send event', 'warn');
        }
      } catch (e) {
        sendToast('main: Failed to process workshop prompt file: ' + (e.message || e), 'error');
        try { fs.unlinkSync(promptFile); } catch {}
      }
    }
  };
  
  // Check on load and then poll every 2 seconds
  setInterval(checkWorkshopPrompt, 2000);
  
  // After the page loads, send current settings so renderer can open settings UI if needed
  win.webContents.once('did-finish-load', () => {
    try {
      const settings = readSettings();
      // validate basic settings
      const okExe = settings && settings.WE_Exe && fs.existsSync(settings.WE_Exe);
      const okWorkshop = settings && settings.WE_Workshop && fs.existsSync(settings.WE_Workshop);
      if (!okExe || !okWorkshop) {
        win.webContents.send('settings-missing', { okExe: !!okExe, okWorkshop: !!okWorkshop, settings });
      }
      
      // Check for workshop prompt file immediately on load
      checkWorkshopPrompt();
    } catch (e) { sendToast('settings check failed: ' + (e.message || e), 'warn'); }
  });
  return win;
}

app.whenReady().then(createWindow);

// Startup diagnostics
sendToast('Selector-app main starting', 'debug');
sendToast('process.cwd(): ' + process.cwd(), 'debug');
sendToast('__dirname: ' + __dirname, 'debug');
sendToast('process.execPath: ' + process.execPath, 'debug');

// IPC handler: when renderer asks to apply a theme
ipcMain.handle('apply-theme', async (event, themeName) => {
  const psPath = path.join(__dirname, '..', 'theme.ps1');
  // use --select to pick a specific theme
  const args = ['-ExecutionPolicy', 'Bypass', '-File', psPath, '--select', themeName];

  return new Promise((resolve, reject) => {
    const child = spawn('powershell', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let resolved = false;

    // helper to attempt resolving from a JSON string
    const tryResolveJson = (text) => {
      const t = text && text.trim();
      if (!t) return false;
      // find first substring that looks like a JSON object (starts with '{')
      const idx = t.indexOf('{');
      if (idx >= 0) {
        const candidate = t.substring(idx);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && (parsed.needs_sub || parsed.needs_workshop)) {
            resolved = true;
            try { event && event.sender && event.sender.send('theme-status', { theme: themeName, line: candidate }); } catch (e) {}
            resolve(parsed);
            return true;
          }
        } catch (e) {
          // not valid JSON yet; ignore
        }
      }
      return false;
    };

    // send streaming lines to renderer as they arrive and look for JSON handshake lines
    child.stdout.on('data', (chunk) => {
      const s = String(chunk);
      stdout += s;
      // attempt to parse JSON handshake from the accumulated stdout (handles split chunks)
      if (!resolved) {
        try {
          const idx = stdout.indexOf('{');
          if (idx >= 0) {
            const candidate = stdout.substring(idx).trim();
            try {
              const parsed = JSON.parse(candidate);
              if (parsed && (parsed.needs_sub || parsed.needs_workshop)) {
                resolved = true;
                sendToast('apply-theme: detected handshake JSON for ' + themeName + ': ' + JSON.stringify(parsed), 'debug');
                try { event && event.sender && event.sender.send('theme-status', { theme: themeName, line: candidate }); } catch (e) {}
                if (parsed && parsed.needs_workshop && parsed.workshop_id) {
                  try {
                    let settings = readSettings();
                    let workshopRoot = settings && settings.WE_Workshop ? settings.WE_Workshop : null;
                    
                    // If workshop path not configured, try auto-detect
                    if (!workshopRoot || !fs.existsSync(workshopRoot)) {
                      sendToast('apply-theme: workshop path not configured or invalid, attempting auto-detect', 'debug');
                      const detected = autoDetectSteamPaths();
                      if (detected && detected.WE_Workshop) {
                        workshopRoot = detected.WE_Workshop;
                        writeSettings(detected);
                        sendToast('apply-theme: auto-detected and saved workshop path: ' + workshopRoot, 'debug');
                      }
                    }
                    
                    const candidateFolder = workshopRoot ? path.join(workshopRoot, String(parsed.workshop_id)) : null;
                    sendToast('apply-theme: checking workshop item at ' + candidateFolder, 'debug');
                    
                    if (candidateFolder && fs.existsSync(candidateFolder)) {
                      sendToast('apply-theme: workshop item FOUND at ' + candidateFolder, 'debug');
                      try { event && event.sender && event.sender.send('workshop-found', { workshopId: parsed.workshop_id, theme: parsed.theme, sub: parsed.sub, folder: candidateFolder }); } catch (e) {}
                      try { event && event.sender && event.sender.send('theme-status', { theme: parsed.theme, sub: parsed.sub, line: `workshop: found at ${candidateFolder}` }); } catch (e) {}
                      resolve(parsed);
                      return;
                    } else {
                      sendToast('apply-theme: workshop item NOT FOUND, will prompt user', 'debug');
                    }
                  } catch (e) { sendToast('apply-theme: workshop existence check failed: ' + (e.message || e), 'warn'); }
                }
                // forward a specific handshake event so the renderer can react immediately
                sendToast('apply-theme: sending theme-handshake event to renderer', 'debug');
                try { event && event.sender && event.sender.send('theme-handshake', parsed); } catch (e) { sendToast('Failed to send theme-handshake: ' + (e.message || e), 'error'); }
                // Resolve with a minimal acknowledgement so the promise completes
                // The actual UI handling is done by the event listener in renderer
                resolve({ handshake_sent: true, type: parsed.needs_sub ? 'needs_sub' : 'needs_workshop' });
                return;
              }
            } catch (e) { /* not complete JSON yet, continue */ }
          }
        } catch (e) { /* ignore */ }
      }

      const lines = s.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      for (const line of lines) {
        try { event && event.sender && event.sender.send('theme-status', { theme: themeName, line }); } catch (e) {}
      }
    });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });

    child.on('error', (err) => { if (!resolved) reject(err.message || String(err)); });
    child.on('close', (code) => {
      if (resolved) return; // already resolved via JSON handshake
      // try to parse the full stdout as JSON handshake first
      try {
        const trimmed = stdout && stdout.trim();
        if (trimmed) {
          // attempt to locate a JSON object within the trimmed output
          const idx = trimmed.indexOf('{');
          if (idx >= 0) {
            const candidate = trimmed.substring(idx);
            const parsed = JSON.parse(candidate);
            if (parsed && (parsed.needs_sub || parsed.needs_workshop)) {
              // If needs_workshop, check whether workshop folder already exists:
              if (parsed.needs_workshop && parsed.workshop_id) {
                try {
                  let settings = readSettings();
                  let workshopRoot = settings && settings.WE_Workshop ? settings.WE_Workshop : null;
                  
                  if (!workshopRoot || !fs.existsSync(workshopRoot)) {
                    const detected = autoDetectSteamPaths();
                    if (detected && detected.WE_Workshop) {
                      workshopRoot = detected.WE_Workshop;
                      writeSettings(detected);
                    }
                  }
                  
                  const candidateFolder = workshopRoot ? path.join(workshopRoot, String(parsed.workshop_id)) : null;
                  console.log('apply-theme (on-close): checking workshop item at', candidateFolder);
                  
                  if (candidateFolder && fs.existsSync(candidateFolder)) {
                    console.log('apply-theme (on-close): workshop item FOUND');
                    try { event && event.sender && event.sender.send('workshop-found', { workshopId: parsed.workshop_id, theme: parsed.theme, sub: parsed.sub, folder: candidateFolder }); } catch (e) {}
                    try { event && event.sender && event.sender.send('theme-status', { theme: parsed.theme, sub: parsed.sub, line: `workshop: found at ${candidateFolder}` }); } catch (e) {}
                    resolve(parsed); return;
                  } else {
                    console.log('apply-theme (on-close): workshop item NOT FOUND');
                  }
                } catch (e) { console.warn('apply-theme (on-close): workshop existence check failed', e); }
              }
              // notify renderer of the handshake as well
              console.log('apply-theme (on-close): sending theme-handshake event to renderer');
              try { event && event.sender && event.sender.send('theme-handshake', parsed); } catch (e) { console.error('Failed to send theme-handshake (on-close)', e); }
              resolve({ handshake_sent: true, type: parsed.needs_sub ? 'needs_sub' : 'needs_workshop' });
              return;
            }
          }
        }
      } catch (e) {
        // ignore parse errors
      }

      if (code !== 0) {
        const errMsg = stderr || `process exited ${code}`;
        reject(errMsg);
      } else {
        resolve({ ok: true, output: stdout });
      }
    });
  });
});

// Helper to auto-detect Steam workshop paths from common locations
function autoDetectSteamPaths() {
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps',
    'D:\\Games\\SteamLibrary\\steamapps',
    'E:\\SteamLibrary\\steamapps',
    'F:\\SteamLibrary\\steamapps',
    'D:\\Steam\\steamapps',
    'E:\\Steam\\steamapps'
  ];
  
  for (const steamapps of candidates) {
    try {
      if (!fs.existsSync(steamapps)) continue;
      const workshop = path.join(steamapps, 'workshop', 'content', '431960');
      const exe = path.join(steamapps, 'common', 'wallpaper_engine', 'wallpaper64.exe');
      if (fs.existsSync(workshop) && fs.existsSync(exe)) {
        sendToast('Auto-detected Steam paths: ' + JSON.stringify({ WE_Workshop: workshop, WE_Exe: exe }), 'debug');
        return { WE_Workshop: workshop, WE_Exe: exe };
      }
    } catch (e) { /* skip */ }
  }
  return null;
}

// Simple settings storage (JSON file next to root)
const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');
function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      // Try auto-detect on first read
      const detected = autoDetectSteamPaths();
      if (detected) {
        writeSettings(detected);
        return detected;
      }
      return {};
    }
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) { return {}; }
}
function writeSettings(obj) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(obj, null, 2), 'utf8');
    return true;
  } catch (e) { sendToast('Failed to write settings: ' + (e.message || e), 'warn'); return false; }
}

// Expose settings read/write and folder/select helpers
ipcMain.handle('get-settings', () => readSettings());
ipcMain.handle('set-settings', (event, obj) => writeSettings(obj));
ipcMain.handle('select-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (res.canceled) return null; return res.filePaths[0];
});
ipcMain.handle('open-external', async (event, url) => { try { await shell.openExternal(url); return true; } catch { return false; } });

// Workshop watch map
const _watchers = new Map();
let _watchIdCounter = 1;
ipcMain.handle('watch-workshop', (event, workshopId, theme, sub) => {
  const settings = readSettings();
  const workshopRoot = settings && settings.WE_Workshop ? settings.WE_Workshop : null;
  if (!workshopRoot) return { error: 'no workshop root configured' };
  const targetFolder = path.join(workshopRoot, String(workshopId));
  const id = String(_watchIdCounter++);
  const webContents = event.sender;
  const interval = setInterval(() => {
    if (fs.existsSync(targetFolder)) {
      clearInterval(interval);
      _watchers.delete(id);
      // notify renderer
      try { webContents.send('workshop-found', { workshopId, theme, sub, folder: targetFolder }); } catch (e) {}
      // trigger theme apply and stream status back to renderer
      try {
        const psPath = path.join(__dirname, '..', 'theme.ps1');
        const sel = `${theme}/${sub}`;
        const args = ['-ExecutionPolicy','Bypass','-File', psPath, '--select', sel];
        const c = spawn('powershell', args, { windowsHide: true });
        c.stdout.on('data', (chunk) => {
          const s = String(chunk);
          // if the child emits a handshake JSON line, forward it as theme-status too
          const idx = s.indexOf('{');
          if (idx >= 0) {
            const candidate = s.substring(idx).trim();
            try {
              const parsed = JSON.parse(candidate);
              if (parsed) {
                webContents.send('theme-status', { theme, sub, line: candidate });
                if (parsed && (parsed.needs_sub || parsed.needs_workshop)) {
                  try { webContents.send('theme-handshake', parsed); } catch (e) {}
                }
              }
            } catch (e) { }
          }
          const lines = s.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
          for (const line of lines) {
            try { webContents.send('theme-status', { theme, sub, line }); } catch (e) {}
          }
        });
        c.stderr.on('data', () => {});
        c.on('close', (code) => {
          if (code === 0) {
            webContents.send('theme-status', { theme, sub, line: 'theme:wallpaper: OK' });
          }
        });
      } catch (e) { /* ignore */ }
    }
  }, 2000);
  _watchers.set(id, interval);
  return { id };
});

ipcMain.handle('cancel-watch', (event, watchId) => {
  if (_watchers.has(watchId)) { clearInterval(_watchers.get(watchId)); _watchers.delete(watchId); return true; }
  return false;
});

ipcMain.handle('mark-skip-workshop', (event, theme, sub) => {
  const root = path.join(__dirname, '..');
  const userStateDir = path.join(root, 'user-state');
  try { if (!fs.existsSync(userStateDir)) fs.mkdirSync(userStateDir, { recursive: true }); } catch {}
  const skipFile = path.join(userStateDir, `${theme}---${sub}---skip-workshop.txt`);
  try { fs.writeFileSync(skipFile, `skipped:${new Date().toISOString()}`, 'utf8'); return true; } catch { return false; }
});

ipcMain.handle('cycle-theme', async () => {
  const psPath = path.join(__dirname, '..', 'theme.ps1');
  const cmd = `powershell -ExecutionPolicy Bypass -File "${psPath}" --cycle`;
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
      } else {
        resolve(stdout);
      }
    });
  });
});

// Discover themes by scanning both legacy `themes/` and `yasb-themes/*/sub-themes/*`
ipcMain.handle('get-themes', async () => {
  try {
    sendToast('get-themes invoked from renderer', 'debug');
    const themesDir = path.join(__dirname, '..', 'themes');
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    sendToast('get-themes: scanning ' + themesDir + ', ' + yasbThemesDir, 'debug');
    const out = {};

    // legacy themes folder
    if (fs.existsSync(themesDir)) {
      const items = fs.readdirSync(themesDir, { withFileTypes: true });
      for (const it of items) {
        if (it.isDirectory()) {
          const manifestPath = path.join(themesDir, it.name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const raw = fs.readFileSync(manifestPath, 'utf8');
              const parsed = JSON.parse(raw);
              parsed.__basePath = path.join(themesDir, it.name);
              out[it.name] = parsed;
            } catch (e) {
              out[it.name] = { error: `manifest parse error: ${e.message}` };
            }
          }
        }
      }
    }

    // new yasb-themes structure: list each top-level theme (don't expose sub-themes here)
    if (fs.existsSync(yasbThemesDir)) {
      const themeFolders = fs.readdirSync(yasbThemesDir, { withFileTypes: true });
      for (const t of themeFolders) {
        if (!t.isDirectory()) continue;
        const themeRoot = path.join(yasbThemesDir, t.name);
        const manifestPath = path.join(themeRoot, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const raw = fs.readFileSync(manifestPath, 'utf8');
            const parsed = JSON.parse(raw);
            parsed.__basePath = themeRoot;
            out[t.name] = parsed;
          } catch (e) {
            out[t.name] = { error: `manifest parse error: ${e.message}` };
          }
        } else {
          // if a top-level meta.json exists, prefer it for card metadata
          const metaPath = path.join(themeRoot, 'meta.json');
          if (fs.existsSync(metaPath)) {
            try {
              const metaRaw = fs.readFileSync(metaPath, 'utf8');
              const metaParsed = JSON.parse(metaRaw);
              // wrap into a manifest-like structure expected by renderer
              const shaped = { meta: {} };
              // possible fields in meta.json: name, authors, version, short-description, long-description, repository, tags
              if (metaParsed.name) shaped.meta.name = metaParsed.name;
              if (metaParsed['short-description']) { shaped.meta['short-description'] = metaParsed['short-description']; shaped.meta.description = metaParsed['short-description']; }
              if (metaParsed['long-description']) { shaped.meta['long-description'] = metaParsed['long-description']; if (!shaped.meta.description) shaped.meta.description = metaParsed['long-description']; }
              if (metaParsed.version) shaped.meta.version = metaParsed.version;
              if (metaParsed.repository) shaped.meta.repository = metaParsed.repository;
              if (metaParsed.tags) shaped.meta.tags = metaParsed.tags;
              if (metaParsed.authors) shaped.meta.authors = metaParsed.authors;
              shaped.__basePath = themeRoot;
              out[t.name] = shaped;
              continue;
            } catch (e) {
              // fall through to try representative sub-manifest
            }
          }
            // no top-level manifest => try to read a representative sub-theme manifest for metadata
            const subRoot = path.join(themeRoot, 'sub-themes');
            if (fs.existsSync(subRoot)) {
              const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d => d.isDirectory());
              if (subs.length > 0) {
                const first = subs[0].name;
                const repManifest = path.join(subRoot, first, 'manifest.json');
                if (fs.existsSync(repManifest)) {
                  try {
                    const raw = fs.readFileSync(repManifest, 'utf8');
                    const parsed = JSON.parse(raw);
                    parsed.__basePath = themeRoot;
                    parsed.__repSub = first;
                    out[t.name] = parsed;
                  } catch (e) {
                    out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
                  }
                } else {
                  out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
                }
              } else {
                out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
              }
            } else {
              out[t.name] = { meta: { name: t.name }, __basePath: themeRoot };
            }
        }
      }
    }

    // Populate subs array for each theme
    for (const themeName of Object.keys(out)) {
      const themeObj = out[themeName];
      if (!themeObj.__basePath) continue;
      
      const subRoot = path.join(themeObj.__basePath, 'sub-themes');
      if (fs.existsSync(subRoot)) {
        const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d => d.isDirectory());
        themeObj.subs = [];
        
        for (const s of subs) {
          const subPath = path.join(subRoot, s.name);
          const manifestPath = path.join(subPath, 'manifest.json');
          const metaPath = path.join(subPath, 'meta.json');
          
          let manifest = null;
          let meta = null;
          
          if (fs.existsSync(manifestPath)) {
            try {
              manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            } catch (e) {
              manifest = { error: e.message };
            }
          }
          
          if (fs.existsSync(metaPath)) {
            try {
              meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            } catch (e) {}
          }
          
          // Look for wallpaper preview image in sub-theme folder (wallpaper.*)
          let wallpaperPreview = null;
          try {
            const files = fs.readdirSync(subPath, { withFileTypes: true });
            const wallpaperFile = files.find(f => 
              f.isFile() && 
              f.name.toLowerCase().startsWith('wallpaper.') &&
              /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(f.name)
            );
            if (wallpaperFile) {
              wallpaperPreview = path.join(subPath, wallpaperFile.name);
            }
          } catch (e) {
            console.warn(`Error reading sub-theme folder for wallpaper preview: ${e.message}`);
          }
          
          themeObj.subs.push({
            name: s.name,
            manifest: manifest,
            meta: meta || (manifest ? manifest.meta : null),
            wallpaperPreview: wallpaperPreview
          });
        }
      }
    }

    return out;
  } catch (e) {
    console.error('get-themes error:', e && e.stack ? e.stack : e);
    return { error: e.message };
  }
});

ipcMain.handle('get-preview-paths', async (event, themeName) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const legacyBase = path.join(__dirname, '..', 'themes');

    let base = null;
    let manifestPath = null;

    // support keys like 'theme/sub' or 'theme:sub'
    let themeKey = themeName;
    let theme = themeName;
    let sub = null;
    if (themeName.includes('/') || themeName.includes(':')) {
      const parts = themeName.includes('/') ? themeName.split('/') : themeName.split(':');
      theme = parts[0]; sub = parts[1];
    }

    // Strict behavior:
    // - If a sub-theme was requested (theme/sub), return ONLY a generated palette from that sub-theme's root-variables (no images).
    // - If no sub requested (major theme), return ONLY the images found in yasb-themes/<theme>/preview/ (if present), and nothing else.
    if (sub) {
      // sub-theme requested: load its manifest and generate palette
      const subManifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
      if (!fs.existsSync(subManifestPath)) return [];
      try {
        const raw = fs.readFileSync(subManifestPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed['root-variables']) {
          const vars = parsed['root-variables'];
          const cols = [];
          for (const k of Object.keys(vars)) {
            const v = vars[k]; if (!v) continue; const s = String(v).trim(); if (/^#|^rgb|^hsl/i.test(s)) cols.push(s);
            if (cols.length >= 6) break;
          }
          if (cols.length) {
            const w = 240, h = 48, sw = Math.floor(w / cols.length);
            let rects = '';
            for (let i = 0; i < cols.length; i++) { const x = i * sw; rects += `<rect x="${x}" y="0" width="${sw}" height="${h}" fill="${cols[i]}"/>`; }
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${rects}</svg>`;
            return [`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`];
          }
        }
      } catch (e) { return []; }
      return [];
    } else {
      // major theme requested: return only files in yasb-themes/<theme>/preview
      const majorPreviewDir = path.join(yasbThemesDir, theme, 'preview');
      if (!fs.existsSync(majorPreviewDir)) return [];
      const out = [];
      const files = fs.readdirSync(majorPreviewDir, { withFileTypes: true }).filter(f => f.isFile());
      for (const f of files) {
        const chosen = path.join(majorPreviewDir, f.name);
        try {
          const buf = fs.readFileSync(chosen);
          const ext = path.extname(chosen).toLowerCase();
          let mime = 'application/octet-stream';
          if (ext === '.png') mime = 'image/png';
          else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
          else if (ext === '.webp') mime = 'image/webp';
          else if (ext === '.gif') mime = 'image/gif';
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          out.push(dataUrl);
        } catch (e) {
          out.push(pathToFileURL(chosen).href);
        }
      }
      return out;
    }
  } catch (e) {
    return [];
  }
});

// Simple ping for diagnostics — returns some runtime info
ipcMain.handle('ping', async () => {
  try {
    sendToast('get ping from renderer — main alive', 'debug');
    return { ok: true, cwd: process.cwd(), dirname: __dirname };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Open a theme's page.html in a new window. Expects the theme folder to contain page.html.
ipcMain.handle('open-theme-page', async (event, themeName) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const legacyBase = path.join(__dirname, '..', 'themes');

    // support theme/sub
    let theme = themeName;
    let sub = null;
    if (themeName.includes('/') || themeName.includes(':')) {
      const parts = themeName.includes('/') ? themeName.split('/') : themeName.split(':');
      theme = parts[0]; sub = parts[1];
    }

    let pagePath = null;
    if (sub) {
      pagePath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'page.html');
    } else {
      const legacy = path.join(legacyBase, theme, 'page.html');
      const yasbRoot = path.join(yasbThemesDir, theme, 'page.html');
      if (fs.existsSync(legacy)) pagePath = legacy;
      else if (fs.existsSync(yasbRoot)) pagePath = yasbRoot;
      else {
        // if multiple subs exist, prefer opening the theme folder page if present
        const subRoot = path.join(yasbThemesDir, theme, 'sub-themes');
        if (fs.existsSync(subRoot)) {
          const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d=>d.isDirectory());
          if (subs.length === 1) {
            pagePath = path.join(subRoot, subs[0].name, 'page.html');
            themeName = `${theme}/${subs[0].name}`;
          }
        }
      }
    }

    if (!pagePath || !fs.existsSync(pagePath)) return { error: 'page.html not found' };
    // Try to load the theme page into the already-open selector window (focused),
    // falling back to creating a new window if none available.
    const target = BrowserWindow.getFocusedWindow() || (BrowserWindow.getAllWindows().length ? BrowserWindow.getAllWindows()[0] : null);
    if (target) {
      await target.loadFile(pagePath, { query: { theme: themeName } });
      return { ok: true, reusedWindow: true };
    }
    // fallback: create a new window (rare)
    const newWin = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    try { Menu.setApplicationMenu(null); } catch (e) {}
    try { newWin.setMenuBarVisibility(false); newWin.setAutoHideMenuBar(true); } catch (e) {}
    await newWin.loadFile(pagePath, { query: { theme: themeName } });
    return { ok: true, reusedWindow: false };
  } catch (e) {
    return { error: e.message };
  }
});

// On macOS: re-create window if no windows remain
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Debug/logging: confirm handlers registered
sendToast('Selector-app: IPC handlers registered: get-themes, get-preview-paths, apply-theme, cycle-theme', 'debug');

// Show main selector (index.html) in focused window
ipcMain.handle('show-selector', async () => {
  try {
    const target = BrowserWindow.getFocusedWindow() || (BrowserWindow.getAllWindows().length ? BrowserWindow.getAllWindows()[0] : null);
    if (!target) return { error: 'no window' };
    await target.loadFile(path.join(__dirname, 'index.html'));
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
});

// List sub-themes for a given top-level theme
ipcMain.handle('list-subthemes', async (event, themeName) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const subRoot = path.join(yasbThemesDir, themeName, 'sub-themes');
    if (!fs.existsSync(subRoot)) return [];
    const subs = fs.readdirSync(subRoot, { withFileTypes: true }).filter(d => d.isDirectory());
    const out = [];
    for (const s of subs) {
      const m = path.join(subRoot, s.name, 'manifest.json');
      let parsed = null;
      if (fs.existsSync(m)) {
        try { parsed = JSON.parse(fs.readFileSync(m, 'utf8')); } catch (e) { parsed = { error: e.message }; }
      }
      out.push({ name: s.name, manifest: parsed });
    }
    return out;
  } catch (e) {
    return { error: e.message };
  }
});

// Mark sub-theme manifest to disable provided wallpaper permanently
ipcMain.handle('disable-sub-wallpaper', (event, theme, sub) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const manifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { error: 'manifest not found' };
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) { parsed = {}; }
    
    // Set wallpaper-engine.enabled to false
    if (!parsed['wallpaper-engine']) parsed['wallpaper-engine'] = {};
    parsed['wallpaper-engine'].enabled = false;
    
    // Remove old property if it exists
    if (parsed.hasOwnProperty('skip-provided-wallpaper')) {
      delete parsed['skip-provided-wallpaper'];
    }
    
    fs.writeFileSync(manifestPath, JSON.stringify(parsed, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('enable-sub-wallpaper', (event, theme, sub) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const manifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { error: 'manifest not found' };
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch (e) { parsed = {}; }
    
    // Set wallpaper-engine.enabled to true
    if (!parsed['wallpaper-engine']) parsed['wallpaper-engine'] = {};
    parsed['wallpaper-engine'].enabled = true;
    
    // Remove old property if it exists
    if (parsed.hasOwnProperty('skip-provided-wallpaper')) {
      delete parsed['skip-provided-wallpaper'];
    }
    
    // Delete the user-state skip file if it exists
    const root = path.join(__dirname, '..');
    const userStateDir = path.join(root, 'user-state');
    const skipFile = path.join(userStateDir, `${theme}---${sub}---skip-workshop.txt`);
    try {
      if (fs.existsSync(skipFile)) {
        fs.unlinkSync(skipFile);
        sendToast('Deleted skip file: ' + skipFile, 'debug');
      }
    } catch (e) {
      sendToast('Failed to delete skip file: ' + (e.message || e), 'warn');
    }
    
    fs.writeFileSync(manifestPath, JSON.stringify(parsed, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
});

// Read theme config file (config.yaml)
ipcMain.handle('read-theme-file', (event, theme, filename) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const filePath = path.join(yasbThemesDir, theme, filename);
    if (!fs.existsSync(filePath)) return { error: 'file not found' };
    const content = fs.readFileSync(filePath, 'utf8');
    return { content };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
});

// Write theme config file (config.yaml)
ipcMain.handle('write-theme-file', (event, theme, filename, content) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const filePath = path.join(yasbThemesDir, theme, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
});

// Read sub-theme manifest
ipcMain.handle('read-subtheme-manifest', (event, theme, sub) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const manifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { error: 'manifest not found' };
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let manifest = {};
    try { manifest = JSON.parse(raw); } catch (e) { manifest = {}; }
    return { manifest };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
});

// Write sub-theme manifest
ipcMain.handle('write-subtheme-manifest', (event, theme, sub, manifest) => {
  try {
    const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
    const manifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
    const content = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
});

// Reload theme if it's currently active
ipcMain.handle('reload-if-active', async (event, theme, sub) => {
  try {
    const stateFile = path.join(__dirname, '..', 'theme.current_status');
    const stateSubFile = path.join(__dirname, '..', 'subtheme.current_status');
    
    // Check if the theme/sub is currently active
    let currentTheme = '';
    let currentSub = '';
    let needsReload = false;
    
    if (fs.existsSync(stateFile)) {
      currentTheme = fs.readFileSync(stateFile, 'utf8').trim();
    }
    
    if (fs.existsSync(stateSubFile)) {
      currentSub = fs.readFileSync(stateSubFile, 'utf8').trim();
    }
    
    // Check if major theme matches (for config.yaml updates)
    const majorThemeMatches = currentTheme === theme;
    
    // Check if exact sub-theme matches (for manifest.json/root-variables updates)
    const subThemeMatches = currentTheme === theme && currentSub === sub;
    
    if (majorThemeMatches || subThemeMatches) {
      sendToast('Active theme detected - applying updates directly to YASB', 'debug');
      
      const yasbConfigPath = path.join(process.env.USERPROFILE, '.config', 'yasb', 'config.yaml');
      const yasbStylePath = path.join(process.env.USERPROFILE, '.config', 'yasb', 'styles.css');
      const yasbThemesDir = path.join(__dirname, '..', 'yasb-themes');
      
      // If major theme matches, update config.yaml widgets only
      if (majorThemeMatches) {
        const sourceConfig = path.join(yasbThemesDir, theme, 'config.yaml');
        if (fs.existsSync(sourceConfig)) {
          sendToast('Updating YASB config.yaml widgets from ' + sourceConfig, 'debug');
          
          // Read source config (from theme)
          const sourceContent = fs.readFileSync(sourceConfig, 'utf8');
          
          // Read existing YASB config
          let existingContent = '';
          if (fs.existsSync(yasbConfigPath)) {
            existingContent = fs.readFileSync(yasbConfigPath, 'utf8');
          }
          
          // Parse source to extract widget lists per bar
          const sourceLines = sourceContent.split('\n');
          const sourceBars = {};
          let currentBar = null;
          let inWidgetsSection = false;
          let currentPosition = '';
          
          for (const line of sourceLines) {
            const barMatch = line.match(/^  ([\w-]+):/);
            if (barMatch) {
              currentBar = barMatch[1];
              sourceBars[currentBar] = { left: [], center: [], right: [] };
              inWidgetsSection = false;
            }
            
            if (currentBar && line.match(/^    widgets:/)) {
              inWidgetsSection = true;
            }
            
            if (inWidgetsSection) {
              const posMatch = line.match(/^      (left|center|right):/);
              if (posMatch) {
                currentPosition = posMatch[1];
              }
              
              const widgetMatch = line.match(/^        - "([^"]+)"/);
              if (widgetMatch && currentPosition) {
                sourceBars[currentBar][currentPosition].push(widgetMatch[1]);
              }
            }
          }
          
          // Now update existing config by replacing widget lists only
          const existingLines = existingContent.split('\n');
          const newLines = [];
          let existingBar = null;
          let inExistingWidgets = false;
          let existingPosition = '';
          let skipWidgets = false;
          
          for (let i = 0; i < existingLines.length; i++) {
            const line = existingLines[i];
            
            const barMatch = line.match(/^  ([\w-]+):/);
            if (barMatch) {
              existingBar = barMatch[1];
              inExistingWidgets = false;
              skipWidgets = false;
              newLines.push(line);
              continue;
            }
            
            if (existingBar && line.match(/^    widgets:/)) {
              inExistingWidgets = true;
              newLines.push(line);
              
              // Insert updated widget lists from source if we have them
              if (sourceBars[existingBar]) {
                for (const pos of ['left', 'center', 'right']) {
                  newLines.push(`      ${pos}:`);
                  for (const widget of sourceBars[existingBar][pos]) {
                    newLines.push(`        - "${widget}"`);
                  }
                }
                skipWidgets = true;
              }
              continue;
            }
            
            // Skip old widget entries if we inserted new ones
            if (skipWidgets && (line.match(/^      (left|center|right):/) || line.match(/^        - "/))) {
              continue;
            }
            
            // Reset skip when we exit widgets section
            if (skipWidgets && line.match(/^  [a-z]/)) {
              skipWidgets = false;
              inExistingWidgets = false;
            }
            
            newLines.push(line);
          }
          
          const newContent = newLines.join('\n');
          
          // Also update widgets section from source
          const sourceWidgetsMatch = sourceContent.match(/^widgets:\s*$(.*?)$/ms);
          const sourceWidgets = sourceWidgetsMatch ? sourceWidgetsMatch[0] : '';
          
          let finalContent = newContent;
          if (sourceWidgets) {
            const existingWidgetsMatch = finalContent.match(/^widgets:\s*$(.*?)$/ms);
            if (existingWidgetsMatch) {
              finalContent = finalContent.replace(existingWidgetsMatch[0], sourceWidgets);
            } else {
              finalContent = finalContent + '\n\n' + sourceWidgets;
            }
          }
          
          fs.writeFileSync(yasbConfigPath, finalContent, 'utf8');
          // Touch file to trigger file watchers
          fs.utimesSync(yasbConfigPath, new Date(), new Date());
          needsReload = true;
        }
      }
      
      // If sub-theme matches, update styles.css with new root variables
      if (subThemeMatches && sub) {
        const manifestPath = path.join(yasbThemesDir, theme, 'sub-themes', sub, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          sendToast('Updating YASB styles.css root variables from ' + manifestPath, 'debug');
          
          // Read manifest to get updated root variables
          const manifestContent = fs.readFileSync(manifestPath, 'utf8');
          let manifest = {};
          try { manifest = JSON.parse(manifestContent); } catch (e) { }
          
          // Build new :root block
          let rootBlock = ':root {\n';
          if (manifest['root-variables']) {
            for (const [key, value] of Object.entries(manifest['root-variables'])) {
              rootBlock += `  ${key}: ${value};\n`;
            }
          }
          rootBlock += '}';
          
          // Read existing styles.css
          let existingStyles = '';
          if (fs.existsSync(yasbStylePath)) {
            existingStyles = fs.readFileSync(yasbStylePath, 'utf8');
          }
          
          // Replace :root block
          const rootPattern = /:root\s*\{[^}]*\}/s;
          let newStyles;
          if (rootPattern.test(existingStyles)) {
            newStyles = existingStyles.replace(rootPattern, rootBlock);
          } else {
            newStyles = rootBlock + '\n\n' + existingStyles;
          }
          
          // Write updated styles
          fs.writeFileSync(yasbStylePath, newStyles, 'utf8');
          // Touch file to trigger file watchers
          fs.utimesSync(yasbStylePath, new Date(), new Date());
          needsReload = true;
        }
      }
      
      return { reloaded: needsReload, updatedConfig: majorThemeMatches, updatedStyles: subThemeMatches };
    }
    
    return { reloaded: false };
  } catch (e) {
    sendToast('reload-if-active error: ' + (e && e.message ? e.message : String(e)), 'error');
    return { reloaded: false, error: e && e.message ? e.message : String(e) };
  }
});
