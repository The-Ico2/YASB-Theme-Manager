// ============================================================================
// EDITOR TAB - Theme Configuration Editor
// ============================================================================

// Editor state management
let editorState = {
    themes: null,
    selectedTheme: null,
    selectedSub: null,
    config: null,
    manifest: null,
    unsavedChanges: false
};

// Initialize editor when tab is opened
async function initEditor() {
    try {
        const loaded = await window.themeAPIAsync.getThemes();
        if (!loaded || loaded.error) {
            if (typeof Utils.sendMessage === 'function') {
                Utils.sendMessage('error', 'Error loading themes for editor');
            }
            return;
        }

        editorState.themes = loaded;
        renderThemeList();
    } catch (e) {
        const msg = 'Error initializing editor: ' + (e.message || e);
        if (typeof Utils.sendMessage === 'function') {
            Utils.sendMessage('error', msg, 5);
        }
    }
}

// Render theme list sidebar
function renderThemeList() {
    const themeList = document.getElementById('theme-list');
    if (!themeList) return;

    const themeNames = Object.keys(editorState.themes);
    let html = '';

    for (const themeName of themeNames) {
        const theme = editorState.themes[themeName];
        if (!theme.subs || theme.subs.length === 0) continue;

        const isSelected = editorState.selectedTheme === themeName;
        const subCount = theme.subs.length;

        html += `
      <div class="theme-list-item ${isSelected ? 'selected' : ''}" onclick="selectTheme('${themeName}')">
        <div class="theme-list-name">${theme.meta?.name || themeName}</div>
        <div class="theme-list-subs">${subCount} sub-theme${subCount !== 1 ? 's' : ''}</div>
      </div>
    `;
    }

    if (!html) {
        html = '<p style="color: #9aa0c0; font-size: 12px; text-align: center;">No themes found</p>';
    }

    themeList.innerHTML = html;
}

// Select a theme
window.selectTheme = async function (themeName) {
    editorState.selectedTheme = themeName;
    editorState.selectedSub = null;

    renderThemeList();

    const theme = editorState.themes[themeName];
    if (!theme || !theme.subs || theme.subs.length === 0) {
        renderEditorEmpty();
        return;
    }

    // Select first sub-theme by default
    editorState.selectedSub = theme.subs[0].name;

    // Load config.yaml
    try {
        const configResult = await window.themeAPI.readThemeFile(themeName, 'config.yaml');
        if (configResult && !configResult.error) {
            editorState.config = configResult.content;
        }
    } catch (e) {
        const msg = 'Error loading config: ' + (e.message || e);
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('error', msg);
    }

    renderEditor();
};

// Select sub-theme
window.selectSubTheme = function (subName) {
    editorState.selectedSub = subName;
    renderEditor();
};

// Render empty editor state
function renderEditorEmpty() {
    const editorMain = document.getElementById('editor-main');
    if (!editorMain) return;

    editorMain.innerHTML = `
    <div class="editor-empty">
      Select a theme from the sidebar to begin editing
    </div>
  `;
}

// Main editor render function
async function renderEditor() {
    const editorMain = document.getElementById('editor-main');
    if (!editorMain) return;

    const theme = editorState.themes[editorState.selectedTheme];
    if (!theme) return;

    const sub = theme.subs.find(s => s.name === editorState.selectedSub);
    if (!sub) return;

    // Load manifest
    try {
        const manifestResult = await window.themeAPI.readSubThemeManifest(editorState.selectedTheme, sub.name);
        if (manifestResult && !manifestResult.error) {
            editorState.manifest = manifestResult.manifest;
        }
    } catch (e) {
        const msg = 'Error loading manifest: ' + (e.message || e);
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('error', msg);
    }

    // Render sub-theme selector
    let subThemeTabs = '';
    for (const s of theme.subs) {
        const isActive = s.name === editorState.selectedSub;
        subThemeTabs += `
      <div class="subtheme-tab ${isActive ? 'active' : ''}" onclick="selectSubTheme('${s.name}')">
        ${s.meta?.name || s.name}
      </div>
    `;
    }

    // Render preview
    const previewHtml = await renderPreview(theme, sub);

    // Render editor panels
    const panelsHtml = renderEditorPanels(theme, sub);

    editorMain.innerHTML = `
    <div class="subtheme-selector">
      <div class="subtheme-tabs">
        ${subThemeTabs}
      </div>
    </div>
    
    ${previewHtml}
    
    <div class="editor-panels">
      ${panelsHtml}
    </div>
  `;
}

// Render preview section
async function renderPreview(theme, sub) {
    // Use wallpaper preview image from sub-theme data
    let previewSrc = '';
    if (sub.wallpaperPreview) {
        previewSrc = 'file:///' + sub.wallpaperPreview.replace(/\\/g, '/');
    }

    // Get root variables from manifest
    const rootVars = editorState.manifest?.['root-variables'] || {};

    // Parse bars and widgets from config
    const bars = parseConfigBars();
    const widgetConfigs = parseWidgetConfigs();

    if (typeof Utils.sendMessage === 'function') {
        Utils.sendMessage('debug', 'Widget configs parsed: ' + Object.keys(widgetConfigs).length + ' widgets');
    }

    // Create container for preview
    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-section';

    // Create header with bar tabs
    const previewHeader = document.createElement('div');
    previewHeader.className = 'preview-header';

    const title = document.createElement('h3');
    title.textContent = 'Live Preview';
    previewHeader.appendChild(title);

    if (bars && bars.length > 1) {
        const barTabsContainer = document.createElement('div');
        barTabsContainer.className = 'subtheme-tabs';
        barTabsContainer.style.margin = '0';

        bars.forEach((bar, i) => {
            const tab = document.createElement('div');
            tab.className = `subtheme-tab ${i === 0 ? 'active' : ''}`;
            tab.textContent = bar.name;
            tab.style.fontSize = '12px';
            tab.onclick = () => switchBarPreview(i);
            barTabsContainer.appendChild(tab);
        });

        previewHeader.appendChild(barTabsContainer);
    }

    previewContainer.appendChild(previewHeader);

    // Create desktop preview area
    const desktopPreview = document.createElement('div');
    desktopPreview.className = 'preview-desktop';

    // Wallpaper and palette preview
    const imageRow = document.createElement('div');
    imageRow.style.cssText = 'display: flex; gap: 12px; margin-bottom: 12px;';

    if (previewSrc) {
        const wallpaperImg = document.createElement('img');
        wallpaperImg.src = previewSrc;
        wallpaperImg.className = 'preview-wallpaper';
        wallpaperImg.alt = 'Wallpaper preview';
        wallpaperImg.style.cssText = 'flex: 2; min-width: 0;';
        imageRow.appendChild(wallpaperImg);
    }

    if (window.generatePalettePreview) {
        const paletteImg = document.createElement('img');
        paletteImg.src = window.generatePalettePreview(editorState.manifest);
        paletteImg.className = 'preview-palette';
        paletteImg.alt = 'Color palette';
        paletteImg.style.cssText = 'flex: 1; min-width: 200px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);';
        imageRow.appendChild(paletteImg);
    }

    desktopPreview.appendChild(imageRow);

    // Render bars using status-bar-renderer
    if (bars && bars.length > 0) {
        bars.forEach((bar, i) => {
            const barContainer = document.createElement('div');
            barContainer.className = `bar-preview-container ${i === 0 ? 'active' : ''}`;
            barContainer.setAttribute('data-bar-index', i);

            // Use the new renderStatusBar function
            if (window.renderStatusBar) {
                const renderedBar = window.renderStatusBar(bar, widgetConfigs, rootVars);
                barContainer.appendChild(renderedBar);
            } else {
                if (typeof Utils.sendMessage === 'function') {
                    Utils.sendMessage('warn', 'window.renderStatusBar is not available');
                }
                barContainer.innerHTML = '<div class="preview-widget">Error: Status bar renderer not loaded</div>';
            }

            desktopPreview.appendChild(barContainer);
        });
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'bar-preview-container active';
        fallback.setAttribute('data-bar-index', '0');
        fallback.innerHTML = '<div class="preview-bar"><div class="preview-widget">Loading...</div></div>';
        desktopPreview.appendChild(fallback);
    }

    previewContainer.appendChild(desktopPreview);

    // Return the outer HTML
    return previewContainer.outerHTML;
}

// Switch between bar previews
window.switchBarPreview = function (index) {
    const containers = document.querySelectorAll('.bar-preview-container');
    containers.forEach((c, i) => {
        if (i === index) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
};

// Render editor panels (colors, metadata, wallpaper, widgets)
function renderEditorPanels(theme, sub) {
    const manifest = editorState.manifest || {};
    const meta = manifest.meta || {};
    const wallpaperEngine = manifest['wallpaper-engine'] || {};
    const rootVars = manifest['root-variables'] || {};

    // Generate color inputs for ALL root variables
    let colorInputsHtml = '';
    const colorVars = Object.keys(rootVars).filter(key =>
        key.startsWith('--') && (rootVars[key].startsWith('#') || rootVars[key].startsWith('rgb'))
    );

    for (const varName of colorVars) {
        const value = rootVars[varName];
        const displayName = varName.replace(/^--/, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const inputId = `color-${varName.replace(/^--/, '').replace(/-/g, '_')}`;

        // Extract hex color from rgba if needed
        let hexValue = value;
        if (value.startsWith('rgba') || value.startsWith('rgb')) {
            // For rgba/rgb, we'll use a default color picker value
            hexValue = '#888888';
        }

        colorInputsHtml += `
      <div class="form-group">
        <label class="form-label">${displayName}</label>
        <div class="color-input-group">
          <input type="color" class="color-preview" id="${inputId}" value="${hexValue}" data-var="${varName}">
          <input type="text" class="form-input" id="${inputId}-text" value="${value}" data-var="${varName}">
        </div>
      </div>
    `;
    }

    const wallpaperEnabled = wallpaperEngine.enabled !== false;
    const workshopId = wallpaperEngine.link ? wallpaperEngine.link.match(/id=(\d+)/)?.[1] || '' : '';

    return `
    <!-- Metadata Panel -->
    <div class="editor-panel">
      <h4><span class="editor-panel-icon">📝</span> Metadata</h4>
      <div class="form-group">
        <label class="form-label">Sub-theme Name</label>
        <input type="text" class="form-input" id="meta-name" value="${meta.name || sub.name}" placeholder="Enter name">
      </div>
      <div class="form-group">
        <label class="form-label">Version</label>
        <input type="text" class="form-input" id="meta-version" value="${meta.version || '1.0.0'}" placeholder="1.0.0">
      </div>
    </div>
    
    <!-- Color Variables Panel -->
    <div class="editor-panel" style="max-height: 400px; overflow-y: auto;">
      <h4><span class="editor-panel-icon">🎨</span> Theme Colors</h4>
      ${colorInputsHtml || '<p style="color: #9aa0c0;">No color variables found</p>'}
    </div>
    
    <!-- Wallpaper Panel -->
    <div class="editor-panel">
      <h4><span class="editor-panel-icon">🖼️</span> Wallpaper Settings</h4>
      <div class="wallpaper-setting">
        <div class="toggle-switch ${wallpaperEnabled ? 'enabled' : ''}" id="wallpaper-toggle" onclick="toggleWallpaper()">
          <div class="toggle-knob"></div>
        </div>
        <span style="color: #cbd4ff; font-size: 14px;">Wallpaper ${wallpaperEnabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div class="form-group">
        <label class="form-label">Workshop ID</label>
        <input type="text" class="form-input" id="workshop-id" value="${workshopId}" placeholder="Enter Steam Workshop ID" ${!wallpaperEnabled ? 'disabled' : ''}>
      </div>
      <div class="form-group">
        <label class="form-label">Workshop Link</label>
        <input type="text" class="form-input" id="workshop-link" value="${wallpaperEngine.link || ''}" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=..." ${!wallpaperEnabled ? 'disabled' : ''}>
      </div>
    </div>
    
    <!-- Widgets Panel -->
    <div class="editor-panel" style="grid-column: 1 / -1;">
      <h4><span class="editor-panel-icon">📦</span> Status Bar Widgets</h4>
      <div class="widget-list" id="widget-list">
        ${renderWidgetList()}
      </div>
    </div>
    
    <!-- Save Button -->
    <div class="editor-panel" style="grid-column: 1 / -1;">
      <button class="save-btn" onclick="saveEditorChanges()">Save Changes</button>
    </div>
  `;
}

// Render widget management list
function renderWidgetList() {
    const bars = parseConfigBars();
    if (!bars || bars.length === 0) return '<p style="color: #9aa0c0; text-align: center;">No widgets found</p>';

    try {
        // Create tabs for each bar
        let tabsHtml = '';
        let contentHtml = '';

        for (let barIndex = 0; barIndex < bars.length; barIndex++) {
            const bar = bars[barIndex];
            const isActive = barIndex === 0;

            // Tab button
            tabsHtml += `
        <button class="widget-bar-tab ${isActive ? 'active' : ''}" onclick="switchWidgetBar(${barIndex})">
          ${bar.name}
        </button>
      `;

            // Content for this bar
            let barContentHtml = '';

            // Group widgets by position
            const positions = ['left', 'center', 'right'];
            for (const pos of positions) {
                const widgets = bar.widgets[pos] || [];

                // Add section divider with add button (show even if empty)
                barContentHtml += `
          <div class="widget-section-divider">
            <span>${pos}</span>
            <button class="widget-btn" onclick="addWidget('${bar.name}', '${pos}')" title="Add widget" style="background: var(--accent2); margin-left: auto;">+</button>
          </div>
        `;

                // Add widgets for this position
                if (widgets.length > 0) {
                    for (let i = 0; i < widgets.length; i++) {
                        const widgetName = widgets[i];
                        barContentHtml += `
              <div class="widget-item" draggable="true">
                <span class="widget-drag-handle">⋮⋮</span>
                <span class="widget-name">${widgetName}</span>
                <div class="widget-actions">
                  <button class="widget-btn" onclick="moveWidgetUp('${bar.name}', '${pos}', ${i})" title="Move up">▲</button>
                  <button class="widget-btn" onclick="moveWidgetDown('${bar.name}', '${pos}', ${i})" title="Move down">▼</button>
                  <button class="widget-btn" onclick="removeWidget('${bar.name}', '${pos}', ${i})" title="Remove">✕</button>
                </div>
              </div>
            `;
                    }
                } else {
                    // Show placeholder for empty position
                    barContentHtml += `
            <div style="color: #6b6f85; font-size: 12px; padding: 8px 12px; text-align: center;">
              No widgets - click + to add
            </div>
          `;
                }
            }

            contentHtml += `
        <div class="widget-bar-content ${isActive ? 'active' : ''}" data-bar-index="${barIndex}">
          ${barContentHtml}
        </div>
      `;
        }

        return `
      <div class="widget-bar-tabs">
        ${tabsHtml}
      </div>
      ${contentHtml}
    `;
    } catch (e) {
        if (typeof Utils.sendMessage === 'function') {
            Utils.sendMessage('error', 'Error rendering widget list: ' + (e.message || e));
        }
        return '<p style="color: #ff6b6b; text-align: center;">Error loading widgets</p>';
    }
}

// Switch between widget bars
window.switchWidgetBar = function (index) {
    const tabs = document.querySelectorAll('.widget-bar-tab');
    const contents = document.querySelectorAll('.widget-bar-content');

    tabs.forEach((tab, i) => {
        if (i === index) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    contents.forEach((content, i) => {
        if (i === index) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
};

// Widget management: Move widget up
window.moveWidgetUp = function (barName, position, index) {
    if (!editorState.config || index <= 0) return;

    const bars = parseConfigBars();
    const bar = bars.find(b => b.name === barName);
    if (!bar || !bar.widgets[position]) return;

    const widgets = bar.widgets[position];
    if (index >= widgets.length) return;

    // Swap with previous widget
    [widgets[index - 1], widgets[index]] = [widgets[index], widgets[index - 1]];

    // Update config string
    updateConfigWithBars(bars);

    // Re-render
    renderEditor();
    if (typeof Utils.sendMessage === 'function') Utils.sendMessage('success', 'Widget moved up', 2);
};

// Widget management: Move widget down
window.moveWidgetDown = function (barName, position, index) {
    if (!editorState.config) return;

    const bars = parseConfigBars();
    const bar = bars.find(b => b.name === barName);
    if (!bar || !bar.widgets[position]) return;

    const widgets = bar.widgets[position];
    if (index >= widgets.length - 1) return;

    // Swap with next widget
    [widgets[index], widgets[index + 1]] = [widgets[index + 1], widgets[index]];

    // Update config string
    updateConfigWithBars(bars);

    // Re-render
    renderEditor();
    if (typeof Utils.sendMessage === 'function') Utils.sendMessage('success', 'Widget moved down', 2);
};

// Widget management: Remove widget
window.removeWidget = function (barName, position, index) {
    if (!editorState.config) return;

    const bars = parseConfigBars();
    const bar = bars.find(b => b.name === barName);
    if (!bar || !bar.widgets[position]) return;

    const widgets = bar.widgets[position];
    if (index >= widgets.length) return;

    const widgetName = widgets[index];
    const confirmed = confirm(`Remove widget "${widgetName}" from ${position}?`);
    if (!confirmed) return;

    // Remove widget
    widgets.splice(index, 1);

    // Update config string
    updateConfigWithBars(bars);

    // Re-render
    renderEditor();
    if (typeof Utils.sendMessage === 'function') Utils.sendMessage('success', 'Widget removed', 2);
};

// Widget management: Add widget
window.addWidget = function (barName, position) {
    if (!editorState.config) return;

    // Get all available widgets from config
    const availableWidgets = getAllAvailableWidgets();
    if (!availableWidgets || availableWidgets.length === 0) {
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('warn', 'No widgets found in config.yaml');
        return;
    }

    // Create dropdown overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

    const panel = document.createElement('div');
    panel.style.cssText = `
    background: linear-gradient(180deg, #1a1a2e, #0f0f1a);
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
    max-height: 500px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  `;

    const title = document.createElement('h3');
    title.textContent = `Add Widget to ${position}`;
    title.style.cssText = `
    margin: 0 0 16px 0;
    color: #cbd4ff;
    font-size: 18px;
  `;

    const widgetList = document.createElement('div');
    widgetList.style.cssText = `
    max-height: 350px;
    overflow-y: auto;
    margin-bottom: 16px;
  `;

    // Add each widget as a clickable item
    availableWidgets.forEach(widgetName => {
        const item = document.createElement('div');
        item.textContent = widgetName;
        item.style.cssText = `
      padding: 10px 12px;
      margin: 4px 0;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      color: #cbd4ff;
      cursor: pointer;
      transition: all 0.2s;
    `;

        item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--accent2, #00dfff)';
            item.style.color = '#0a0a14';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = 'rgba(255, 255, 255, 0.05)';
            item.style.color = '#cbd4ff';
        });

        item.addEventListener('click', () => {
            const bars = parseConfigBars();
            const bar = bars.find(b => b.name === barName);
            if (!bar || !bar.widgets[position]) return;

            // Add widget to position
            bar.widgets[position].push(widgetName);

            // Update config string
            updateConfigWithBars(bars);

            // Re-render
            renderEditor();
            if (typeof Utils.sendMessage === 'function') {
                Utils.sendMessage('success', `Added ${widgetName} to ${position}`, 2);
            }

            // Close overlay
            overlay.remove();
        });

        widgetList.appendChild(item);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
    width: 100%;
    padding: 10px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 6px;
    color: #cbd4ff;
    cursor: pointer;
    font-size: 14px;
  `;

    cancelBtn.addEventListener('click', () => overlay.remove());

    panel.appendChild(title);
    panel.appendChild(widgetList);
    panel.appendChild(cancelBtn);
    overlay.appendChild(panel);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
};

// Parse bars from config YAML
function parseConfigBars() {
    if (!editorState.config) {
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('debug', 'No config loaded');
        return [];
    }

    const lines = editorState.config.split('\n');
    const bars = [];
    let currentBar = null;
    let inBarsSection = false;
    let inBarSection = false;
    let inWidgetsSection = false;
    let currentPosition = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect bars: section
        if (line.match(/^bars:/)) {
            inBarsSection = true;
            continue;
        }

        if (inBarsSection) {
            // Detect bar name (e.g., "  primary-bar:")
            if (line.match(/^  ([\w-]+):/)) {
                if (currentBar) {
                    bars.push(currentBar);
                }
                const barName = line.match(/^  ([\w-]+):/)[1];
                currentBar = { name: barName, widgets: { left: [], center: [], right: [] } };
                inBarSection = true;
                inWidgetsSection = false;
                continue;
            }

            // Detect widgets: section within a bar
            if (inBarSection && line.match(/^    widgets:/)) {
                inWidgetsSection = true;
                continue;
            }

            // Detect position (left/center/right)
            if (inWidgetsSection && line.match(/^      (left|center|right):/)) {
                currentPosition = line.match(/^      (left|center|right):/)[1];
                continue;
            }

            // Detect widget name (with quotes)
            if (inWidgetsSection && currentPosition) {
                const match = line.match(/^        - "([^"]+)"/);
                if (match) {
                    const widgetName = match[1];
                    currentBar.widgets[currentPosition].push(widgetName);
                    continue;
                }
            }

            // Exit bars section when we hit top-level key
            if (line.match(/^[a-z]/)) {
                if (currentBar) bars.push(currentBar);
                inBarsSection = false;
                break;
            }
        }
    }

    if (currentBar && !bars.includes(currentBar)) {
        bars.push(currentBar);
    }

    return bars;
}

// Parse widget configurations from config YAML
function parseWidgetConfigs() {
    if (!editorState.config) {
        Utils.sendMessage('error', 'No config loaded in editorState');
        return {};
    }

    Utils.sendMessage('debug', 'Starting widget parsing...');
    const lines = editorState.config.split('\n');
    Utils.sendMessage('debug', `Total lines in config: ${lines.length}`);
    
    // Helper: decode escape sequences like "\\ue670" or surrogate pairs
    function decodeEscapes(str) {
        if (!str || typeof str !== 'string') return str;
        // Quick check for common escape patterns
        if (!(/\\u|\\x|\\n|\\r|\\t/.test(str))) return str;
        try {
            // Wrap in double quotes and let JSON.parse handle escapes
            return JSON.parse('"' + str.replace(/"/g, '\\"') + '"');
        } catch (e) {
            return str;
        }
    }
    
    const widgets = {};
    let inWidgetsSection = false;
    let currentWidget = null;
    let currentWidgetName = '';
    let widgetIndent = -1;  // Track the indent level of the current widget

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Remove any trailing newline/carriage return characters
        line = line.replace(/[\r\n]+$/, '');
        
        // Skip empty lines
        if (!line.trim()) continue;

        // Calculate indent level (count leading spaces)
        const indent = line.search(/\S/);
        
        // Detect widgets: section (indent 0)
        if (indent === 0 && line.match(/^widgets:/)) {
            inWidgetsSection = true;
            Utils.sendMessage('debug', `Found widgets section at line ${i}`);
            continue;
        }

        // Exit widgets section when we hit another top-level section
        if (inWidgetsSection && indent === 0 && !line.match(/^widgets:/)) {
            if (currentWidget && currentWidgetName) {
                Utils.sendMessage('debug', `Saving FINAL widget "${currentWidgetName}" with type: "${currentWidget.type}"`);
                widgets[currentWidgetName] = currentWidget;
            }
            break;
        }

        if (inWidgetsSection) {
            // Detect widget name - should be indented more than "widgets:" but less than its properties
            // Typically 2 spaces for widget names
            const widgetMatch = line.match(/^\s{2}(\w+):\s*$/);
            if (widgetMatch) {
                // Save previous widget if exists
                if (currentWidget && currentWidgetName) {
                    Utils.sendMessage('debug', `Saving widget "${currentWidgetName}" with type: "${currentWidget.type}"`);
                    widgets[currentWidgetName] = currentWidget;
                }
                
                currentWidgetName = widgetMatch[1];
                widgetIndent = indent;
                currentWidget = {
                    type: '',
                    options: {}
                };
                Utils.sendMessage('debug', `Found widget "${currentWidgetName}" at line ${i} with indent ${widgetIndent}`);
                continue;
            }

            // Parse properties of the current widget (must be indented MORE than the widget name)
            if (currentWidget && widgetIndent >= 0 && indent > widgetIndent) {
                // Look for "type:" at any indent level deeper than the widget name
                const typeMatch = line.match(/^\s+type:\s*"?([^"\r\n]+)"?\s*$/);
                if (typeMatch) {
                    currentWidget.type = typeMatch[1].trim();
                    continue;
                }

                // Look for "options:" section
                if (line.match(/^\s+options:\s*$/)) {
                    continue;
                }

                // Parse option properties (anything indented deeper than widget name that's not "type")
                const optionMatch = line.match(/^\s+(\w+):\s*(.*)$/);
                if (optionMatch && optionMatch[1] !== 'type' && optionMatch[1] !== 'options') {
                    const optionName = optionMatch[1];
                    let optionValue = optionMatch[2].trim();
                    
                    // Handle inline arrays like: wifi_icons: ["\ue670", "\ue671", "\ue672"]
                    if (optionValue.startsWith('[') && optionValue.includes(']')) {
                        try {
                            // Extract array content and parse as JSON
                            const arrayMatch = optionValue.match(/\[(.*?)\]/);
                            if (arrayMatch) {
                                const arrayContent = '[' + arrayMatch[1] + ']';
                                currentWidget.options[optionName] = JSON.parse(arrayContent);
                                Utils.sendMessage('debug', `  → Parsed inline array "${optionName}": ${JSON.stringify(currentWidget.options[optionName])}`);
                            }
                        } catch (e) {
                            Utils.sendMessage('warn', `Failed to parse inline array "${optionName}": ${e.message}`);
                            currentWidget.options[optionName] = '';
                        }
                    }
                    // Handle multi-line arrays like: volume_icons:\n  - item1\n  - item2
                    else if (optionValue === '' || optionValue === '[') {
                        // Start of a multi-line array - collect items
                        const arrayItems = [];
                        const arrayIndent = indent;
                        let j = i + 1;
                        
                        while (j < lines.length) {
                            let arrayLine = lines[j].replace(/[\r\n]+$/, '');
                            if (!arrayLine.trim()) {
                                j++;
                                continue;
                            }
                            
                            const arrayLineIndent = arrayLine.search(/\S/);
                            
                            // Stop if we've exited the array (less or equal indent)
                            if (arrayLineIndent <= arrayIndent) {
                                break;
                            }
                            
                            // Parse array item (starts with -)
                            const itemMatch = arrayLine.match(/^\s+-\s+(.+)$/);
                            if (itemMatch) {
                                let item = itemMatch[1].trim();
                                // Remove surrounding quotes if present
                                if ((item.startsWith('"') && item.endsWith('"')) ||
                                    (item.startsWith("'") && item.endsWith("'"))) {
                                    item = item.slice(1, -1);
                                }
                                // Decode escape sequences so unicode escapes become real characters
                                item = decodeEscapes(item);
                                arrayItems.push(item);
                            }
                            
                            j++;
                        }
                        
                        if (arrayItems.length > 0) {
                            currentWidget.options[optionName] = arrayItems;
                            Utils.sendMessage('debug', `  → Parsed array "${optionName}" with ${arrayItems.length} items: ${JSON.stringify(arrayItems)}`);
                            i = j - 1; // Skip the lines we just processed
                        } else {
                            currentWidget.options[optionName] = '';
                        }
                    }
                    // Handle simple string values
                    else if (optionValue && !optionValue.endsWith(':')) {
                        // Remove quotes if present
                        if ((optionValue.startsWith('"') && optionValue.endsWith('"')) ||
                            (optionValue.startsWith("'") && optionValue.endsWith("'"))) {
                            optionValue = optionValue.slice(1, -1);
                        }
                        // Decode escape sequences so unicode escapes become real characters
                        optionValue = decodeEscapes(optionValue);
                        currentWidget.options[optionName] = optionValue;
                    } else {
                        currentWidget.options[optionName] = '';
                    }
                }
            }
        }
    }

    // Save last widget if exists
    if (currentWidget && currentWidgetName) {
        Utils.sendMessage('debug', `Saving FINAL widget "${currentWidgetName}" with type: "${currentWidget.type}"`);
        widgets[currentWidgetName] = currentWidget;
    }

    // Debug logging
    Utils.sendMessage('info', `✓ Parsed ${Object.keys(widgets).length} total widgets`);
    Object.keys(widgets).forEach(name => {
        const widget = widgets[name];
        if (!widget.type) {
            Utils.sendMessage('warn', `Widget "${name}" has no type!`);
        } else {
            Utils.sendMessage('debug', `  → "${name}": type="${widget.type}"`);
        }
    });

    return widgets;
}

// Get all available widgets from config
function getAllAvailableWidgets() {
    if (!editorState.config) return [];

    const lines = editorState.config.split('\n');
    const widgets = [];
    let inWidgetsSection = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect widgets: section
        if (line.match(/^widgets:/)) {
            inWidgetsSection = true;
            continue;
        }

        if (inWidgetsSection) {
            // Detect widget name (e.g., "  home:")
            const widgetMatch = line.match(/^  (\w+):/);
            if (widgetMatch) {
                widgets.push(widgetMatch[1]);
                continue;
            }

            // Exit widgets section when we hit another top-level section
            if (line.match(/^[a-z]/) && !line.match(/^  /)) {
                break;
            }
        }
    }

    return widgets.sort();
}

// Update config YAML with modified bars
function updateConfigWithBars(bars) {
    if (!editorState.config) return;

    const lines = editorState.config.split('\n');
    const newLines = [];
    let inBarsSection = false;
    let inBarConfig = false;
    let inWidgetsSection = false;
    let currentBarName = '';
    let skipWidgetLines = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect bars: section start
        if (line.match(/^bars:/)) {
            inBarsSection = true;
            newLines.push(line);
            continue;
        }

        if (inBarsSection) {
            // Detect bar name (e.g., "  primary-bar:")
            const barMatch = line.match(/^  ([\w-]+):/);
            if (barMatch) {
                currentBarName = barMatch[1];
                inBarConfig = true;
                inWidgetsSection = false;
                newLines.push(line);
                continue;
            }

            // Detect widgets: section within a bar
            if (inBarConfig && line.match(/^    widgets:/)) {
                inWidgetsSection = true;
                skipWidgetLines = false;
                newLines.push(line);

                // Find the bar in our updated bars array
                const bar = bars.find(b => b.name === currentBarName);
                if (bar) {
                    // Insert updated widget lists
                    for (const pos of ['left', 'center', 'right']) {
                        newLines.push(`      ${pos}:`);
                        for (const widget of bar.widgets[pos]) {
                            newLines.push(`        - "${widget}"`);
                        }
                    }
                    skipWidgetLines = true;
                }
                continue;
            }

            // Skip old widget list lines if we've already inserted new ones
            if (skipWidgetLines && line.match(/^      (left|center|right):/)) {
                // Skip position lines and their widget entries
                while (i < lines.length - 1 && lines[i + 1].match(/^        - "/)) {
                    i++;
                }
                continue;
            }

            // Exit bars section when we hit another top-level section
            if (line.match(/^[a-z]/) && !line.match(/^  /)) {
                inBarsSection = false;
                inBarConfig = false;
                inWidgetsSection = false;
                newLines.push(line);
                continue;
            }

            // Keep all other bar configuration lines (enabled, screens, dimensions, etc.)
            if (!skipWidgetLines) {
                newLines.push(line);
            }
        } else {
            newLines.push(line);
        }
    }

    editorState.config = newLines.join('\n');
    editorState.unsavedChanges = true;
}

// Toggle wallpaper on/off
window.toggleWallpaper = async function () {
    const toggle = document.getElementById('wallpaper-toggle');
    const isEnabled = toggle.classList.contains('enabled');

    if (isEnabled) {
        // Disable
        const result = await window.themeAPI.disableSubWallpaper(editorState.selectedTheme, editorState.selectedSub);
        if (result && result.ok) {
            if (typeof Utils.sendMessage === 'function') Utils.sendMessage('success', 'Wallpaper disabled');
            renderEditor();
        }
    } else {
        // Enable
        const result = await window.themeAPI.enableSubWallpaper(editorState.selectedTheme, editorState.selectedSub);
        if (result && result.ok) {
            if (typeof Utils.sendMessage === 'function') Utils.sendMessage('success', 'Wallpaper enabled');
            renderEditor();
        }
    }
};

// Save all editor changes
window.saveEditorChanges = async function () {
    if (!editorState.unsavedChanges) {
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('info', 'No changes to save');
        return;
    }

    if (!editorState.selectedTheme || !editorState.selectedSub) {
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('error', 'No theme selected');
        return;
    }

    try {
        // Gather all edits from the UI
        const updates = {
            config: editorState.config,
            manifest: { ...editorState.manifest }
        };

        // Update metadata
        const metaName = document.getElementById('meta-name');
        const metaVersion = document.getElementById('meta-version');
        if (metaName && metaVersion) {
            if (!updates.manifest.meta) updates.manifest.meta = {};
            updates.manifest.meta.name = metaName.value.trim();
            updates.manifest.meta.version = metaVersion.value.trim();
        }

        // Update color variables
        const colorInputs = document.querySelectorAll('.form-input[id$="-text"]');
        if (colorInputs.length > 0) {
            if (!updates.manifest['root-variables']) updates.manifest['root-variables'] = {};
            colorInputs.forEach(input => {
                const varName = input.dataset.var;
                if (varName && varName.startsWith('--')) {
                    updates.manifest['root-variables'][varName] = input.value.trim();
                }
            });
        }

        // Update wallpaper settings
        const workshopId = document.getElementById('workshop-id');
        const workshopLink = document.getElementById('workshop-link');
        if (workshopId && workshopLink) {
            if (!updates.manifest['wallpaper-engine']) updates.manifest['wallpaper-engine'] = {};

            // Keep existing enabled state
            const toggle = document.getElementById('wallpaper-toggle');
            updates.manifest['wallpaper-engine'].enabled = toggle && toggle.classList.contains('enabled');

            const link = workshopLink.value.trim();
            updates.manifest['wallpaper-engine'].link = link;

            // Extract file from workshop ID or link
            let fileId = workshopId.value.trim();
            if (!fileId && link) {
                const match = link.match(/id=(\d+)/);
                if (match) fileId = match[1];
            }
            if (fileId) {
                updates.manifest['wallpaper-engine'].file = fileId;
            }
        }

        // Save config.yaml
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('info', 'Saving config.yaml...', 2);
        const configResult = await window.themeAPI.writeThemeFile(
            editorState.selectedTheme,
            'config.yaml',
            updates.config
        );

        if (configResult && configResult.error) {
            if (typeof Utils.sendMessage === 'function') {
                Utils.sendMessage('error', 'Failed to save config.yaml: ' + configResult.error);
            }
            return;
        }

        // Save manifest.json
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('info', 'Saving manifest.json...', 2);
        const manifestResult = await window.themeAPI.writeSubThemeManifest(
            editorState.selectedTheme,
            editorState.selectedSub,
            updates.manifest
        );

        if (manifestResult && manifestResult.error) {
            if (typeof Utils.sendMessage === 'function') {
                Utils.sendMessage('error', 'Failed to save manifest.json: ' + manifestResult.error);
            }
            return;
        }

        // Success
        editorState.unsavedChanges = false;
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('success', 'Changes saved successfully!');

        // Update the manifest in state
        editorState.manifest = updates.manifest;

        // Check if this is the currently active theme and reload it
        try {
            const reloadResult = await window.themeAPI.reloadIfActive(
                editorState.selectedTheme,
                editorState.selectedSub
            );

            if (reloadResult && reloadResult.reloaded) {
                const updatesList = [];
                if (reloadResult.updatedConfig) updatesList.push('config');
                if (reloadResult.updatedStyles) updatesList.push('styles');

                if (updatesList.length > 0 && typeof Utils.sendMessage === 'function') {
                    Utils.sendMessage('success', `YASB ${updatesList.join(' & ')} updated live!`, 3);
                } else if (typeof Utils.sendMessage === 'function') {
                    Utils.sendMessage('success', 'Theme reloaded in YASB', 3);
                }
            }
        } catch (e) {
            // Don't show error to user - save was successful, reload is just a bonus
        }

    } catch (e) {
        const msg = 'Save error: ' + (e.message || e);
        if (typeof Utils.sendMessage === 'function') Utils.sendMessage('error', msg, 5);
    }
};

// Sync color inputs (delegated event listener for dynamic elements)
document.addEventListener('input', (e) => {
    if (e.target.type === 'color' && e.target.classList.contains('color-preview')) {
        const textInput = document.getElementById(e.target.id + '-text');
        if (textInput) textInput.value = e.target.value;
    } else if (e.target.classList.contains('form-input') && e.target.id.endsWith('-text')) {
        const colorId = e.target.id.replace('-text', '');
        const colorInput = document.getElementById(colorId);
        if (colorInput && colorInput.type === 'color') {
            // Only update if it's a valid hex color
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                colorInput.value = e.target.value;
            }
        }
    }
});

// Export editor initialization for tab navigation
if (typeof window !== 'undefined') {
    window.initEditor = initEditor;
}

// ======================================================================
// Generate live preview HTML
// ===================================================================
// Status bar renderer for live preview in the editor

/** HTML Hierarchy:
 *  <div class="yasb-bar-preview" style="...">
 *      <div class="bar-section-left" style="...">
 *          <div class="widget-container">
 * 
 *              <!-- Widget CSS -->
 *               <style>
 *               </style>
 * 
 *              <!-- Widget HTML -->
 *               <div class='widget'>
 *               </div>
 * 
 *              <!-- Widget JS -->
 *               <script>
 *               </script>
 *          </div>
 *      </div>
 *      <div class="bar-section-center" style="...">
 *          <div class="widget-container">
 * 
 *              <!-- Widget CSS -->
 *               <style>
 *               </style>
 * 
 *              <!-- Widget HTML -->
 *               <div class='widget'>
 *               </div>
 * 
 *              <!-- Widget JS -->
 *               <script>
 *               </script>
 *          </div>
 *          <div class="widget-container">
 * 
 *              <!-- Widget CSS -->
 *               <style>
 *               </style>
 * 
 *              <!-- Widget HTML -->
 *               <div class='widget'>
 *               </div>
 * 
 *              <!-- Widget JS -->
 *               <script>
 *               </script>
 *          </div>
 *      </div>
 *      <div class="bar-section-right" style="...">
 *          <div class="widget-container">
 * 
 *              <!-- Widget CSS -->
 *               <style>
 *               </style>
 * 
 *              <!-- Widget HTML -->
 *               <div class='widget'>
 *               </div>
 * 
 *              <!-- Widget JS -->
 *               <script>
 *               </script>
 *          </div>
*       </div>
 */
/**
 * Generate a color palette canvas from manifest root-variables
 * @param {object} manifest - Sub-theme manifest with root-variables
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {string} Data URL of generated palette image
 */
window.generatePalettePreview = function (manifest, width = 320, height = 180) {
    Utils.sendMessage('debug', 'Generating palette preview for manifest: ' + JSON.stringify(manifest));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!manifest || !manifest['root-variables']) {
        // Default fallback
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#9aa0c0';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No colors defined', width / 2, height / 2);
        return canvas.toDataURL();
    }

    const vars = manifest['root-variables'];

    // Extract key colors
    const accent1 = vars['--accent1'] || '#00dfff';
    const accent2 = vars['--accent2'] || '#bc13fe';
    const accent3 = vars['--accent3'] || '#ff6b6b';
    const bgDark = vars['--bg-dark'] || '#0d0c19';
    const bgDarker = vars['--bg-darker'] || '#090814';
    const bgPanel = vars['--bg-panel'] || 'rgba(15, 15, 28, 0.85)';
    const textLight = vars['--text-light'] || '#eaeaff';
    const textGray = vars['--text-gray'] || '#b0b0c8';

    // Helper to parse rgba/hex colors
    const parseColor = (color) => {
        if (color.startsWith('rgba(')) {
            return color;
        } else if (color.startsWith('rgb(')) {
            return color;
        } else if (color.startsWith('#')) {
            return color;
        }
        return color;
    };

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, parseColor(bgDarker));
    bgGrad.addColorStop(1, parseColor(bgDark));
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Draw accent bars at top
    const barHeight = 4;
    ctx.fillStyle = parseColor(accent1);
    ctx.fillRect(0, 0, width / 3, barHeight);
    ctx.fillStyle = parseColor(accent2);
    ctx.fillRect(width / 3, 0, width / 3, barHeight);
    ctx.fillStyle = parseColor(accent3);
    ctx.fillRect((width / 3) * 2, 0, width / 3, barHeight);

    // Draw color swatches
    const swatchSize = 40;
    const swatchY = 30;
    const swatchSpacing = 50;
    const swatchStartX = (width - (swatchSpacing * 3 + swatchSize)) / 2;

    // Accent 1
    ctx.fillStyle = parseColor(accent1);
    ctx.fillRect(swatchStartX, swatchY, swatchSize, swatchSize);
    ctx.shadowColor = parseColor(accent1);
    ctx.shadowBlur = 15;
    ctx.fillRect(swatchStartX, swatchY, swatchSize, swatchSize);
    ctx.shadowBlur = 0;

    // Accent 2
    ctx.fillStyle = parseColor(accent2);
    ctx.fillRect(swatchStartX + swatchSpacing + swatchSize, swatchY, swatchSize, swatchSize);
    ctx.shadowColor = parseColor(accent2);
    ctx.shadowBlur = 15;
    ctx.fillRect(swatchStartX + swatchSpacing + swatchSize, swatchY, swatchSize, swatchSize);
    ctx.shadowBlur = 0;

    // Accent 3
    ctx.fillStyle = parseColor(accent3);
    ctx.fillRect(swatchStartX + (swatchSpacing + swatchSize) * 2, swatchY, swatchSize, swatchSize);
    ctx.shadowColor = parseColor(accent3);
    ctx.shadowBlur = 15;
    ctx.fillRect(swatchStartX + (swatchSpacing + swatchSize) * 2, swatchY, swatchSize, swatchSize);
    ctx.shadowBlur = 0;

    // Theme name from manifest
    ctx.fillStyle = parseColor(textLight);
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(manifest.meta?.name || 'Theme', width / 2, 110);

    // Color labels
    ctx.fillStyle = parseColor(textGray);
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Accent 1', swatchStartX + swatchSize / 2, swatchY + swatchSize + 16);
    ctx.fillText('Accent 2', swatchStartX + swatchSpacing + swatchSize + swatchSize / 2, swatchY + swatchSize + 16);
    ctx.fillText('Accent 3', swatchStartX + (swatchSpacing + swatchSize) * 2 + swatchSize / 2, swatchY + swatchSize + 16);

    // Sample panel with gradient
    const panelX = 30;
    const panelY = 130;
    const panelW = width - 60;
    const panelH = 30;

    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
    panelGrad.addColorStop(0, parseColor(accent1) + '40');
    panelGrad.addColorStop(0.5, parseColor(accent2) + '40');
    panelGrad.addColorStop(1, parseColor(accent3) + '40');

    ctx.fillStyle = panelGrad;
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Border
    ctx.strokeStyle = parseColor(accent1);
    ctx.lineWidth = 1;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    return canvas.toDataURL();
};

/**
 * Render a YASB status bar preview
 * @param {object} barConfig - Bar configuration from config.yaml
 * @param {object} widgets - Widget definitions from config.yaml
 * @param {object} rootVars - CSS root variables from manifest
 * @returns {HTMLElement} Rendered bar element
 */
window.renderStatusBar = function (barConfig, widgets, rootVars = {}) {
    Utils.sendMessage('debug', 'Rendering status bar preview with config: ' + JSON.stringify({ barConfig, widgets, rootVars }));
    const bar = document.createElement('div');
    bar.className = 'yasb-bar-preview';
    bar.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: ${barConfig.dimensions?.height || 34}px;
    background: ${rootVars['--bg-panel'] || 'rgba(15, 15, 28, 0.85)'};
    border-radius: 8px;
    padding: 0 ${barConfig.padding?.left || 4}px 0 ${barConfig.padding?.right || 4}px;
    backdrop-filter: blur(${barConfig.blur_effect?.enabled ? '10px' : '0'});
    border: 1px solid ${rootVars['--border-soft'] || 'rgba(255,255,255,0.06)'};
    box-shadow: ${rootVars['--shadow-strong'] || '0px 0px 18px rgba(0, 0, 0, 0.70)'};
    gap: 8px;
    font-family: 'Segoe UI', sans-serif;
    font-size: 13px;
    color: ${rootVars['--text-light'] || '#eaeaff'};
    `;

    // Create left, center, right sections
    const left = document.createElement('div');
    left.className = 'bar-section-left';
    left.style.cssText = 'display: flex; align-items: center; gap: 6px; flex: 1;';

    const center = document.createElement('div');
    center.className = 'bar-section-center';
    center.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const right = document.createElement('div');
    right.className = 'bar-section-right';
    right.style.cssText = 'display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end;';

    // Render widgets for each section
    const barWidgets = barConfig.widgets || {};

    if (barWidgets.left) {
        barWidgets.left.forEach(widgetName => {
            const widgetConfig = widgets[widgetName];
            if (!widgetConfig) {
                Utils.sendMessage('warn', `Widget "${widgetName}" not found in config`);
                return;
            }
            Utils.sendMessage('debug', `Rendering widget "${widgetName}" with type: ${widgetConfig.type}`);
            const widgetContainer = renderWidget(widgetName, widgetConfig, rootVars);
            if (widgetContainer) left.appendChild(widgetContainer);
        });
    }

    if (barWidgets.center) {
        barWidgets.center.forEach(widgetName => {
            const widgetConfig = widgets[widgetName];
            if (!widgetConfig) {
                Utils.sendMessage('warn', `Widget "${widgetName}" not found in config`);
                return;
            }
            Utils.sendMessage('debug', `Rendering widget "${widgetName}" with type: ${widgetConfig.type}`);
            const widgetContainer = renderWidget(widgetName, widgetConfig, rootVars);
            if (widgetContainer) center.appendChild(widgetContainer);
        });
    }

    if (barWidgets.right) {
        barWidgets.right.forEach(widgetName => {
            const widgetConfig = widgets[widgetName];
            if (!widgetConfig) {
                Utils.sendMessage('warn', `Widget "${widgetName}" not found in config`);
                return;
            }
            Utils.sendMessage('debug', `Rendering widget "${widgetName}" with type: ${widgetConfig.type}`);
            const widgetContainer = renderWidget(widgetName, widgetConfig, rootVars);
            if (widgetContainer) right.appendChild(widgetContainer);
        });
    }

    bar.appendChild(left);
    bar.appendChild(center);
    bar.appendChild(right);

    return bar;
};

/**
 * Render individual widget
 * @param {string} name - Widget name
 * @param {object} config - Widget configuration
 * @param {object} rootVars - CSS root variables
 * @returns {HTMLElement} Widget container element with injected HTML/CSS/JS
 */
function renderWidget(name, config, rootVars) {
    Utils.sendMessage('debug', 'Rendering widget: ' + name + ', config: ' + JSON.stringify(config));
    if (!config) {
        Utils.sendMessage('warn', `No config found for widget: ${name}`);
        return null;
    }

    const type = config.type;
    if (!type) {
        Utils.sendMessage('warn', `No type defined for widget: ${name}. Config: ${JSON.stringify(config)}`);
        return null;
    }

    Utils.sendMessage('debug', `Widget type: ${type}`);
    const options = config.options || {};
    Utils.sendMessage('debug', `Widget options for ${name}: ${JSON.stringify(options)}`);

    // Get widget template from window.Widgets
    const widgetTemplate = window.Widgets && window.Widgets[type];
    if (!widgetTemplate) {
        Utils.sendMessage('warn', `No widget template found for type: ${type} (widget: ${name})`);
        return null;
    }

    // Create widget container
    const container = document.createElement('div');
    container.className = 'widget-container';
    container.style.cssText = 'display: inline-flex; align-items: center;';

    // Parse the widget template to extract style, html, and script
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = widgetTemplate;

    // Extract and inject style
    const styleEl = tempDiv.querySelector('style');
    if (styleEl) {
        const style = document.createElement('style');
        style.textContent = styleEl.textContent;
        container.appendChild(style);
    }

    // Extract HTML content
    const htmlElements = Array.from(tempDiv.children).filter(
        child => child.tagName !== 'STYLE' && child.tagName !== 'SCRIPT'
    );
    
    // Process widget content based on options
    htmlElements.forEach(el => {
        const clonedEl = el.cloneNode(true);
        
        // Apply widget-specific customizations
        applyWidgetOptions(clonedEl, type, options, name);
        
        container.appendChild(clonedEl);
    });

    // Extract and execute script
    const scriptEl = tempDiv.querySelector('script');
    if (scriptEl && scriptEl.textContent.trim()) {
        try {
            const script = document.createElement('script');
            script.textContent = scriptEl.textContent;
            container.appendChild(script);
        } catch (e) {
            Utils.sendMessage('debug', `Error executing widget script for ${type}: ${e.message}`);
        }
    }

    return container;
}

/**
 * Apply widget options to customize the preview display
 */
function applyWidgetOptions(element, type, options, widgetName) {
    // Try to find a label field (check various common label field names)
    let labelText = options.label || 
                    options.label_alt || 
                    options.label_collapsed ||
                    options.label_offline ||
                    options.label_workspace_btn ||
                    options.ethernet_label ||
                    '';
    
    if (labelText) {
        labelText = processWidgetLabel(labelText, type, options);
        const labelEl = element.querySelector('.label, .widget-label');
        if (labelEl) {
            labelEl.innerHTML = labelText;
        }
    }
    // Note: Grouper widgets and some specialized widgets don't have labels
    
    // Handle progress bars
    if (options.progress_bar) {
        applyProgressBar(element, options.progress_bar);
    }
}

/**
 * Process widget label template strings
 */
function processWidgetLabel(label, type, options) {
    let processedLabel = label;
    
    Utils.sendMessage('debug', `Processing label: "${label}" with options: ${JSON.stringify(Object.keys(options))}`);

    // Prepare wifi icon array fallback (wifi_icons, wifi_icons_secured, wifi_icons_unsecured)
    const wifiIcons = (Array.isArray(options.wifi_icons) && options.wifi_icons.length > 0)
        ? options.wifi_icons
        : (Array.isArray(options.wifi_icons_secured) && options.wifi_icons_secured.length > 0)
            ? options.wifi_icons_secured
            : (Array.isArray(options.wifi_icons_unsecured) && options.wifi_icons_unsecured.length > 0)
                ? options.wifi_icons_unsecured
                : null;

    if (wifiIcons) {
        const midIndex = Math.floor(wifiIcons.length / 2);
        Utils.sendMessage('debug', `Replacing {wifi_icon} with: ${wifiIcons[midIndex]}`);
        processedLabel = processedLabel.replace(/{wifi_icon}/g, wifiIcons[midIndex]);
    }

    // Prepare volume/icon arrays fallback
    const volumeIcons = (Array.isArray(options.volume_icons) && options.volume_icons.length > 0)
        ? options.volume_icons
        : (Array.isArray(options.volume_icons_list) && options.volume_icons_list.length > 0)
            ? options.volume_icons_list
            : null;

    if (volumeIcons) {
        const midIndex = Math.floor(volumeIcons.length / 2);
        Utils.sendMessage('debug', `Replacing {icon} with volume icon: ${volumeIcons[midIndex]}`);
        processedLabel = processedLabel.replace(/{icon}/g, volumeIcons[midIndex]);
    }
    
    // Handle specific icon objects
    if (options.icons) {
        Object.keys(options.icons).forEach(iconKey => {
            const iconValue = options.icons[iconKey];
            processedLabel = processedLabel.replace(new RegExp(`\\{${iconKey}\\}`, 'g'), iconValue);
        });
        // Use first icon as default {icon} if not already replaced
        if (processedLabel.includes('{icon}')) {
            const firstIcon = Object.values(options.icons)[0];
            if (firstIcon) {
                processedLabel = processedLabel.replace(/{icon}/g, firstIcon);
            }
        }
    }
    
    // Replace common placeholder patterns with sample data
    const replacements = {
        // Time/Date
        '{%H:%M:%S}': new Date().toLocaleTimeString('en-US', { hour12: false }),
        '{%H:%M}': new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        '{%A, %B %d %Y %H:%M}': new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        
        // Window info
        '{win[title]}': 'Active Window',
        '{win[class_name]}': 'WindowClass',
        '{win[process][name]}': 'app.exe',
        '{win[hwnd]}': '12345',
        
        // Media
        '{title}': 'Song Title',
        '{artist}': 'Artist Name',
        
        // Network
        '{wifi_name}': 'WiFi Network',
        '{wifi_strength}': '75',
        '{ip_addr}': '192.168.1.100',
        
        // Battery
        '{percent}': '85',
        '{time_remaining}': '2:30',
        '{charging_icon}': '⚡',
        
        // System info
        '{info[utilization]}': '45',
        '{info[percent][total]}': '35',
        '{virtual_mem_percent}': '60',
        '{swap_mem_percent}': '20',
        '{level}': '50',
        '{volume_label}': 'C',
        '{space[used][gb]}': '250',
        '{space[total][gb]}': '500',
        
        // Other
        '{data}': '',
        '{count}': '3',
        '{device_count}': '2',
        '{device_name}': 'Device',
        '{items_count}': '5',
        '{items_size}': '1.2 GB',
        '{index}': '1'
    };
    
    // Apply replacements
    Object.keys(replacements).forEach(key => {
        processedLabel = processedLabel.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacements[key]);
    });
    
    // Final fallbacks: replace any remaining placeholders with sensible defaults
    if (processedLabel.includes('{wifi_icon}')) {
        const fallbackWifi = (wifiIcons && wifiIcons[0]) || '';
        processedLabel = processedLabel.replace(/{wifi_icon}/g, fallbackWifi);
    }

    if (processedLabel.includes('{icon}')) {
        // try volumeIcons, then any icons object values
        const fallbackIcon = (volumeIcons && volumeIcons[0]) || (options.icons ? Object.values(options.icons)[0] : '') || '';
        processedLabel = processedLabel.replace(/{icon}/g, fallbackIcon);
    }
    
    return processedLabel;
}

/**
 * Apply progress bar styling to widget
 */
function applyProgressBar(element, progressConfig) {
    if (!progressConfig.enabled) return;
    
    const size = progressConfig.size || 14;
    const thickness = progressConfig.thickness || 2;
    const color = progressConfig.color || '#91d7e3';
    const bgColor = progressConfig.background_color || '#242739';
    
    // Create circular progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'widget-progress-bar';
    progressBar.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: ${thickness}px solid ${bgColor};
        border-top-color: ${color};
        border-right-color: ${color};
        margin: 0 4px;
        display: inline-block;
        vertical-align: middle;
    `;
    
    // Insert progress bar at the beginning or based on position
    if (progressConfig.position === 'left') {
        element.insertBefore(progressBar, element.firstChild);
    } else {
        element.appendChild(progressBar);
    }
}

// Used to render widgets in the status bar preview


// Export for use in renderer
window.StatusBarRenderer = {
    generatePalettePreview: window.generatePalettePreview,
    renderStatusBar: window.renderStatusBar
};