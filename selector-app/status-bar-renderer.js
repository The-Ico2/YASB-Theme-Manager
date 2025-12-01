// Status bar renderer for live preview in the editor

/**
 * Generate a color palette canvas from manifest root-variables
 * @param {object} manifest - Sub-theme manifest with root-variables
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {string} Data URL of generated palette image
 */
window.generatePalettePreview = function(manifest, width = 320, height = 180) {
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
window.renderStatusBar = function(barConfig, widgets, rootVars = {}) {
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
      const widget = renderWidget(widgetName, widgets[widgetName], rootVars);
      if (widget) left.appendChild(widget);
    });
  }
  
  if (barWidgets.center) {
    barWidgets.center.forEach(widgetName => {
      const widget = renderWidget(widgetName, widgets[widgetName], rootVars);
      if (widget) center.appendChild(widget);
    });
  }
  
  if (barWidgets.right) {
    barWidgets.right.forEach(widgetName => {
      const widget = renderWidget(widgetName, widgets[widgetName], rootVars);
      if (widget) right.appendChild(widget);
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
 * @returns {HTMLElement} Rendered widget element
 */
function renderWidget(name, config, rootVars) {
  if (!config) return null;
  
  const widget = document.createElement('div');
  widget.className = `widget widget-${name}`;
  widget.style.cssText = `
    padding: 4px 8px;
    background: ${rootVars['--bg-widget'] || 'rgba(22, 22, 38, 0.65)'};
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${rootVars['--text-light'] || '#eaeaff'};
    border: 1px solid ${rootVars['--border-soft'] || 'rgba(255,255,255,0.06)'};
  `;
  
  const type = config.type;
  const options = config.options || {};
  
  // Render based on widget type
  if (type === 'yasb.clock.ClockWidget') {
    widget.innerHTML = `<span>⏰ ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>`;
  } else if (type === 'yasb.cpu.CpuWidget') {
    widget.innerHTML = `<span>${options.label || 'CPU'}</span><span style="color: ${rootVars['--accent2'] || '#00dfff'}">45%</span>`;
  } else if (type === 'yasb.memory.MemoryWidget') {
    widget.innerHTML = `<span>${options.label || 'MEM'}</span><span style="color: ${rootVars['--accent2'] || '#00dfff'}">62%</span>`;
  } else if (type === 'yasb.gpu.GpuWidget') {
    widget.innerHTML = `<span>${options.label || 'GPU'}</span><span style="color: ${rootVars['--accent2'] || '#00dfff'}">38%</span>`;
  } else if (type === 'yasb.disk.DiskWidget') {
    widget.innerHTML = `<span>💾 ${options.volume_label || 'C'}</span>`;
  } else if (type === 'yasb.volume.VolumeWidget') {
    widget.innerHTML = `<span>🔊</span>`;
  } else if (type === 'yasb.microphone.MicrophoneWidget') {
    widget.innerHTML = `<span>🎤</span>`;
  } else if (type === 'yasb.battery.BatteryWidget') {
    widget.innerHTML = `<span>🔋 85%</span>`;
  } else if (type === 'yasb.wifi.WifiWidget') {
    widget.innerHTML = `<span>📶</span>`;
  } else if (type === 'yasb.bluetooth.BluetoothWidget') {
    widget.innerHTML = `<span>🔵</span>`;
  } else if (type === 'yasb.media.MediaWidget') {
    widget.innerHTML = `<span>▶️ Now Playing</span>`;
  } else if (type === 'yasb.notifications.NotificationsWidget') {
    widget.innerHTML = `<span>🔔 ${options.label || '3'}</span>`;
  } else if (type === 'yasb.active_window.ActiveWindowWidget') {
    widget.innerHTML = `<span>📄 Active Window</span>`;
    widget.style.flex = '1';
    widget.style.maxWidth = '300px';
    widget.style.overflow = 'hidden';
    widget.style.textOverflow = 'ellipsis';
    widget.style.whiteSpace = 'nowrap';
  } else if (type === 'komorebi.workspaces.WorkspaceWidget') {
    const workspaces = document.createElement('div');
    workspaces.style.cssText = 'display: flex; gap: 4px;';
    for (let i = 1; i <= 5; i++) {
      const ws = document.createElement('span');
      ws.style.cssText = `
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: ${i === 1 ? rootVars['--accent1'] || '#00dfff' : rootVars['--bg-surface'] || 'rgba(22, 22, 38, 0.55)'};
        color: ${i === 1 ? rootVars['--bg-dark'] || '#000' : rootVars['--text-gray'] || '#b0b0c8'};
        font-size: 11px;
      `;
      ws.textContent = i;
      workspaces.appendChild(ws);
    }
    widget.innerHTML = '';
    widget.appendChild(workspaces);
    widget.style.padding = '2px 6px';
  } else if (type === 'yasb.systray.SystrayWidget') {
    widget.innerHTML = `<span>⚙️</span><span>🔔</span><span>📊</span>`;
  } else if (type === 'yasb.power_menu.PowerMenuWidget') {
    widget.innerHTML = `<span>⏻</span>`;
  } else if (type === 'yasb.home.HomeWidget') {
    widget.innerHTML = `<span>🏠</span>`;
  } else if (type === 'yasb.applications.ApplicationsWidget') {
    widget.innerHTML = `<span>📱</span>`;
  } else if (type === 'yasb.recycle_bin.RecycleBinWidget') {
    widget.innerHTML = `<span>🗑️</span>`;
  } else if (type === 'yasb.custom.CustomWidget') {
    widget.innerHTML = `<span>${options.label || '⚡'}</span>`;
  } else if (type === 'yasb.grouper.GrouperWidget') {
    // Render grouped widgets
    const groupContainer = document.createElement('div');
    groupContainer.style.cssText = 'display: flex; gap: 4px;';
    if (options.widgets && Array.isArray(options.widgets)) {
      options.widgets.forEach(w => {
        const subWidget = renderWidget(w, config, rootVars);
        if (subWidget) groupContainer.appendChild(subWidget);
      });
    }
    widget.innerHTML = '';
    widget.appendChild(groupContainer);
    widget.style.padding = '2px';
  } else {
    // Default fallback
    widget.innerHTML = `<span>${name}</span>`;
  }
  
  return widget;
}

// Export for use in renderer
window.StatusBarRenderer = {
  generatePalettePreview: window.generatePalettePreview,
  renderStatusBar: window.renderStatusBar
};