// ============================================================================
// GLOBAL CONFIGURATION VARIABLES
// ============================================================================
window.Variables = {
    // Animation control
    allowAnimations: true,
    animationDuration: 300, // ms
    
    // Debug configuration
    debug: {
        mode: 'verbose',        // 'verbose', 'normal', 'minimal', 'silent'
        logLevel: 'debug',      // 'debug', 'info', 'warn', 'error', 'none'
        console: true          // Enable/disable console output
    },
    
    // Toast notification settings
    toast: {
        defaultDuration: 4,    // seconds
        stackSpacing: 10,      // pixels between stacked toasts
        maxVisible: 5          // maximum visible toasts at once
    }
};

// Sync with existing debug mode variables if they exist
if (typeof window.debugMode !== 'undefined') window.Variables.debug.mode = window.debugMode;
if (typeof window.debugLogLevel !== 'undefined') window.Variables.debug.logLevel = window.debugLogLevel;
if (typeof window.debugConsole !== 'undefined') window.Variables.debug.console = window.debugConsole;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
window.Utils = (() => {
    const Utils = {
        /**
         * Send a toast message notification
         * Adapted from widget project to work with theme manager
         * @param {string} type - Message type: 'info', 'success', 'error', 'warn', 'debug'
         * @param {string} message - Message text to display
         * @param {number} duration - Display duration in seconds (0 = persistent)
         */
        sendMessage: function(type, message, duration = null) {
            try {
                // Use default duration if not specified
                if (duration === null) {
                    duration = window.Variables.toast.defaultDuration;
                }

                // Normalize type
                if (type === 'warning') type = 'warn';

                // Check if message should be displayed based on debug mode
                const debugMode = window.Variables.debug.mode;
                let shouldDisplay = true;

                switch (debugMode) {
                    case 'verbose':
                        shouldDisplay = true;
                        break;
                    case 'normal':
                        shouldDisplay = (type !== 'debug');
                        break;
                    case 'minimal':
                        shouldDisplay = (type === 'success' || type === 'error');
                        break;
                    case 'silent':
                        shouldDisplay = false;
                        break;
                }

                if (!shouldDisplay) return;

                // Console logging
                if (window.Variables.debug.console) {
                    const logLevels = { 'debug': 0, 'info': 1, 'success': 1, 'warn': 2, 'error': 3, 'none': 999 };
                    const currentLevel = logLevels[window.Variables.debug.logLevel] || logLevels.info;
                    const messageLevel = logLevels[type] || logLevels.info;

                    if (messageLevel >= currentLevel) {
                        const logMessage = `[${type.toUpperCase()}] ${message}`;
                        switch (type) {
                            case 'debug': console.debug(logMessage); break;
                            case 'error': console.error(logMessage); break;
                            case 'warn': console.warn(logMessage); break;
                            default: console.log(logMessage); break;
                        }
                    }
                }

                // Create toast chip
                const chip = document.createElement("div");
                chip.className = `msg-chip msg-${type}`;
                chip.textContent = message;

                // Base styling
                const baseStyle = {
                    position: "fixed",
                    right: "20px",
                    padding: "10px 15px",
                    borderRadius: "6px",
                    color: "#fff",
                    fontFamily: "Inter, Segoe UI, sans-serif",
                    fontSize: "14px",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
                    zIndex: 99999,
                    opacity: 0,
                    transition: window.Variables.allowAnimations 
                        ? `opacity ${window.Variables.animationDuration}ms ease, transform ${window.Variables.animationDuration}ms ease`
                        : "none",
                    transform: window.Variables.allowAnimations ? "translateY(10px)" : "translateY(0)"
                };

                const typeStyles = {
                    error:   { backgroundColor: "rgba(220,53,69,0.95)" },    
                    warn:    { backgroundColor: "rgba(255,193,7,0.95)", color: "#222" },
                    success: { backgroundColor: "rgba(40,167,69,0.95)" },
                    info:    { backgroundColor: "rgba(23,162,184,0.95)" },
                    debug:   { backgroundColor: "rgba(108,117,125,0.95)" }
                };

                Object.assign(chip.style, baseStyle, typeStyles[type] || typeStyles.info);

                // Limit visible toasts
                const activeChips = window.Animations.chip.getActive();
                if (activeChips.length >= window.Variables.toast.maxVisible) {
                    const oldest = activeChips.shift();
                    if (oldest && oldest.parentNode) {
                        oldest.remove();
                    }
                }

                // Compute vertical offset based on existing chips
                const spacing = window.Variables.toast.stackSpacing;
                let bottomOffset = 20;
                activeChips.forEach(c => {
                    bottomOffset += c.offsetHeight + spacing;
                });
                chip.style.bottom = bottomOffset + "px";

                document.body.appendChild(chip);
                window.Animations.chip.track(chip);
                if (window.Variables.allowAnimations) {
                    requestAnimationFrame(() => {
                        chip.style.opacity = 1;
                        chip.style.transform = "translateY(0)";
                    });
                } else {
                    chip.style.opacity = 1;
                }

                // Auto-dismiss (unless duration is 0)
                // Auto-dismiss (unless duration is 0)
                if (duration > 0) {
                    setTimeout(() => {
                        if (window.Variables.allowAnimations) {
                            chip.style.opacity = 0;
                            chip.style.transform = "translateY(10px)";
                            chip.addEventListener("transitionend", () => {
                                chip.remove();
                                window.Animations.chip.untrack(chip);
                                window.Animations.chip.reposition();
                            });
                        } else {
                            chip.remove();
                            window.Animations.chip.untrack(chip);
                            window.Animations.chip.reposition();
                        }
                    }, duration * 1000);
                }
            } catch (e) {
                console.error(`Utils.sendMessage failed: ${e}`);
            }
        },

        /**
         * Create and animate a theme card element
         * @param {object} themeData - Theme metadata and configuration
         * @param {HTMLElement} container - Container element to append card to
         * @returns {HTMLElement} Created theme card element
         */
        createThemeCard: function(themeData, container) {
            try {
                const card = document.createElement('div');
                card.className = 'theme-card';
                card.setAttribute('data-theme', themeData.name);

                if (container) {
                    container.appendChild(card);
                    window.Animations.card.enter(card);
                }

                return card;
            } catch (e) {
                Utils.sendMessage('error', `Failed to create theme card: ${e.message || e}`, 5);
                return null;
            }
        },

        /**
         * Delete/remove a theme card with animation
         * @param {string} themeName - Name of theme to remove
         * @param {HTMLElement} container - Container element
         */
        deleteThemeCard: function(themeName, container) {
            try {
                const card = container.querySelector(`.theme-card[data-theme="${themeName}"]`);
                if (!card) {
                    Utils.sendMessage('warn', `Theme card '${themeName}' not found`, 3);
                    return;
                }

                window.Animations.card.exit(card, {
                    onComplete: () => {
                        card.remove();
                        Utils.sendMessage('info', `Theme '${themeName}' removed`, 2);
                    }
                });
            } catch (e) {
                Utils.sendMessage('error', `Failed to delete theme card: ${e.message || e}`, 5);
            }
        },

        /**
         * Animate element - delegates to window.Animations
         * @param {HTMLElement} element - Element to animate
         * @param {string} animationType - Animation type
         * @param {object} options - Animation options
         */
        animate: function(element, animationType, options = {}) {
            return window.Animations.animate(element, animationType, options);
        },

        /**
         * Show confirmation dialog with animation
         * @param {string} message - Confirmation message
         * @param {object} options - Dialog options
         * @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
         */
        confirm: function(message, options = {}) {
            return new Promise((resolve) => {
                try {
                    const overlay = document.createElement('div');
                    overlay.className = 'utils-confirm-overlay';
                    
                    const title = options.title || 'Confirm';
                    const confirmText = options.confirmText || 'Confirm';
                    const cancelText = options.cancelText || 'Cancel';

                    overlay.innerHTML = `
                        <div class="utils-confirm-dialog">
                            <div class="utils-confirm-title">${title}</div>
                            <div class="utils-confirm-message">${message}</div>
                            <div class="utils-confirm-buttons">
                                <button class="utils-confirm-btn utils-confirm-cancel">${cancelText}</button>
                                <button class="utils-confirm-btn utils-confirm-ok">${confirmText}</button>
                            </div>
                        </div>
                    `;

                    Object.assign(overlay.style, {
                        position: 'fixed',
                        inset: '0',
                        background: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: '100001',
                        opacity: '0',
                        transition: window.Variables.allowAnimations ? `opacity ${window.Variables.animationDuration}ms ease` : 'none'
                    });

                    const dialog = overlay.querySelector('.utils-confirm-dialog');
                    Object.assign(dialog.style, {
                        background: 'linear-gradient(180deg, #1a1a2e, #0f0f1a)',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '400px',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                        transform: window.Variables.allowAnimations ? 'scale(0.9)' : 'scale(1)',
                        transition: window.Variables.allowAnimations ? `transform ${window.Variables.animationDuration}ms ease` : 'none'
                    });

                    // Style elements
                    const titleEl = dialog.querySelector('.utils-confirm-title');
                    Object.assign(titleEl.style, {
                        fontSize: '18px',
                        fontWeight: 'bold',
                        marginBottom: '12px',
                        color: '#cbd4ff'
                    });

                    const messageEl = dialog.querySelector('.utils-confirm-message');
                    Object.assign(messageEl.style, {
                        marginBottom: '20px',
                        color: '#9aa0c0',
                        lineHeight: '1.5'
                    });

                    const buttonsEl = dialog.querySelector('.utils-confirm-buttons');
                    Object.assign(buttonsEl.style, {
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px'
                    });

                    const buttons = dialog.querySelectorAll('.utils-confirm-btn');
                    buttons.forEach(btn => {
                        Object.assign(btn.style, {
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            transition: 'all 0.2s ease'
                        });
                    });

                    const cancelBtn = dialog.querySelector('.utils-confirm-cancel');
                    Object.assign(cancelBtn.style, {
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: '#cbd4ff'
                    });

                    const okBtn = dialog.querySelector('.utils-confirm-ok');
                    Object.assign(okBtn.style, {
                        background: 'var(--accent1, #00dfff)',
                        color: '#0a0a14'
                    });

                    const cleanup = (result) => {
                        window.Animations.modal.hide(overlay, dialog, {
                            onComplete: () => {
                                overlay.remove();
                                resolve(result);
                            }
                        });
                    };

                    cancelBtn.addEventListener('click', () => cleanup(false));
                    okBtn.addEventListener('click', () => cleanup(true));
                    overlay.addEventListener('click', (e) => {
                        if (e.target === overlay) cleanup(false);
                    });

                    document.body.appendChild(overlay);
                    window.Animations.modal.show(overlay, dialog);

                } catch (e) {
                    Utils.sendMessage('error', `Failed to show confirm dialog: ${e.message || e}`, 5);
                    resolve(false);
                }
            });
        },
                    
        /**
         * Show loading spinner overlay
         * @param {string} message - Loading message to display
         * @param {HTMLElement} container - Optional container (defaults to document.body)
         */
        showLoading: function(message = 'Loading...', container = document.body) {
            return window.Animations.loading.show(container, message);
        },

        /**
         * Hide loading spinner overlay
         * @param {HTMLElement} container - Optional container (defaults to document.body)
         */
        hideLoading: function(container = document.body) {
            return window.Animations.loading.hide(container);
        }
    };

    // Flush any diagnostic messages queued before Utils was available
    try {
        if (window.__pendingMessages && Array.isArray(window.__pendingMessages)) {
            for (const m of window.__pendingMessages) {
                try { Utils.sendMessage(m.type, m.message, m.duration); } catch (_) {}
            }
            window.__pendingMessages = [];
        }
    } catch (_) {}

    return Utils;
})();

// =====================================================================
// ANIMATION LIBRARY
// =====================================================================
window.Animations = (() => {
    const activeChips = []; // Track active toast messages for repositioning
    
    /**
     * Initialize animation styles and keyframes
     */
    function initializeStyles() {
        if (document.getElementById('utils-animation-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'utils-animation-styles';
        style.textContent = `
            /* Spinner Animation */
            .utils-loader-spinner {
                width: 50px;
                height: 50px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top-color: #00dfff;
                border-radius: 50%;
                animation: utils-spin 1s linear infinite;
            }
            .utils-loader-message {
                margin-top: 20px;
                color: #fff;
                font-family: 'Inter', sans-serif;
                font-size: 16px;
            }
            .utils-loader-content {
                text-align: center;
            }
            
            /* Keyframe Animations */
            @keyframes utils-spin {
                to { transform: rotate(360deg); }
            }
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-10px); }
            }
            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.05); opacity: 0.8; }
            }
            @keyframes wobble {
                0%, 100% { transform: translateX(0) rotate(0deg); }
                15% { transform: translateX(-10px) rotate(-5deg); }
                30% { transform: translateX(8px) rotate(3deg); }
                45% { transform: translateX(-8px) rotate(-3deg); }
                60% { transform: translateX(6px) rotate(2deg); }
                75% { transform: translateX(-4px) rotate(-1deg); }
            }
            @keyframes swing {
                20% { transform: rotate(15deg); }
                40% { transform: rotate(-10deg); }
                60% { transform: rotate(5deg); }
                80% { transform: rotate(-5deg); }
                100% { transform: rotate(0deg); }
            }
            @keyframes flip {
                0% { transform: perspective(400px) rotateY(0); }
                100% { transform: perspective(400px) rotateY(360deg); }
            }
            @keyframes heartbeat {
                0%, 100% { transform: scale(1); }
                10%, 30% { transform: scale(0.9); }
                20%, 40% { transform: scale(1.1); }
            }
            @keyframes jello {
                0%, 100% { transform: skewX(0deg) skewY(0deg); }
                30% { transform: skewX(25deg) skewY(25deg); }
                40% { transform: skewX(-15deg) skewY(-15deg); }
                50% { transform: skewX(15deg) skewY(15deg); }
                65% { transform: skewX(-5deg) skewY(-5deg); }
                75% { transform: skewX(5deg) skewY(5deg); }
            }
            @keyframes tada {
                0%, 100% { transform: scale(1) rotate(0deg); }
                10%, 20% { transform: scale(0.9) rotate(-3deg); }
                30%, 50%, 70%, 90% { transform: scale(1.1) rotate(3deg); }
                40%, 60%, 80% { transform: scale(1.1) rotate(-3deg); }
            }
            @keyframes rubber-band {
                0%, 100% { transform: scaleX(1); }
                30% { transform: scaleX(1.25) scaleY(0.75); }
                40% { transform: scaleX(0.75) scaleY(1.25); }
                50% { transform: scaleX(1.15) scaleY(0.85); }
                65% { transform: scaleX(0.95) scaleY(1.05); }
                75% { transform: scaleX(1.05) scaleY(0.95); }
            }
            @keyframes flash {
                0%, 50%, 100% { opacity: 1; }
                25%, 75% { opacity: 0; }
            }
            @keyframes glow {
                0%, 100% { box-shadow: 0 0 5px rgba(0, 223, 255, 0.5); }
                50% { box-shadow: 0 0 20px rgba(0, 223, 255, 0.8), 0 0 30px rgba(0, 223, 255, 0.6); }
            }
            @keyframes rotate-in {
                0% { transform: rotate(-200deg) scale(0); opacity: 0; }
                100% { transform: rotate(0) scale(1); opacity: 1; }
            }
            @keyframes rotate-out {
                0% { transform: rotate(0) scale(1); opacity: 1; }
                100% { transform: rotate(200deg) scale(0); opacity: 0; }
            }
            @keyframes zoom-in {
                0% { transform: scale(0); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes zoom-out {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(0); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    // Initialize styles immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeStyles);
    } else {
        initializeStyles();
    }

    // ============================================================================
    // TOAST CHIP ANIMATIONS
    // ============================================================================
    const chip = {
        /**
         * Track a new chip for repositioning
         */
        track: function(chipElement) {
            if (!activeChips.includes(chipElement)) {
                activeChips.push(chipElement);
            }
        },

        /**
         * Untrack a chip
         */
        untrack: function(chipElement) {
            const index = activeChips.indexOf(chipElement);
            if (index !== -1) {
                activeChips.splice(index, 1);
            }
        },

        /**
         * Reposition all active chips with smooth animation
         */
        reposition: function() {
            const spacing = window.Variables.toast.stackSpacing;
            let offset = 20;
            
            activeChips.forEach(c => {
                if (window.Variables.allowAnimations) {
                    c.style.transition = `bottom ${window.Variables.animationDuration}ms ease`;
                }
                c.style.bottom = offset + "px";
                offset += c.offsetHeight + spacing;
            });
        },

        /**
         * Get active chips array
         */
        getActive: function() {
            return activeChips;
        }
    };

    // ============================================================================
    // ELEMENT ANIMATIONS
    // ============================================================================
    const element = {
        /**
         * Fade in animation
         */
        fadeIn: function(el, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            el.style.transition = `opacity ${duration}ms ease`;
            el.style.opacity = '0';
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Fade out animation
         */
        fadeOut: function(el, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            el.style.transition = `opacity ${duration}ms ease`;
            el.style.opacity = '1';
            requestAnimationFrame(() => {
                el.style.opacity = '0';
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Slide in animation
         */
        slideIn: function(el, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            const direction = options.direction || 'down';
            const transforms = {
                left: 'translateX(-100%)',
                right: 'translateX(100%)',
                up: 'translateY(-100%)',
                down: 'translateY(100%)'
            };
            
            el.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            el.style.transform = transforms[direction] || transforms.down;
            el.style.opacity = '0';
            
            requestAnimationFrame(() => {
                el.style.transform = 'translate(0, 0)';
                el.style.opacity = '1';
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Slide out animation
         */
        slideOut: function(el, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            const direction = options.direction || 'down';
            const transforms = {
                left: 'translateX(-100%)',
                right: 'translateX(100%)',
                up: 'translateY(-100%)',
                down: 'translateY(100%)'
            };
            
            el.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            el.style.transform = 'translate(0, 0)';
            el.style.opacity = '1';
            
            requestAnimationFrame(() => {
                el.style.transform = transforms[direction] || transforms.down;
                el.style.opacity = '0';
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Scale in animation
         */
        scaleIn: function(el, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            el.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            el.style.transform = 'scale(0.8)';
            el.style.opacity = '0';
            
            requestAnimationFrame(() => {
                el.style.transform = 'scale(1)';
                el.style.opacity = '1';
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Scale out animation
         */
        scaleOut: function(el, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            el.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            el.style.transform = 'scale(1)';
            el.style.opacity = '1';
            
            requestAnimationFrame(() => {
                el.style.transform = 'scale(0.8)';
                el.style.opacity = '0';
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Apply keyframe animation
         */
        keyframe: function(el, animationName, options = {}) {
            if (!el || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            const duration = options.duration || window.Variables.animationDuration;
            const easing = options.easing || 'ease';
            
            el.style.animation = `${animationName} ${duration}ms ${easing}`;
            
            const handleComplete = () => {
                el.removeEventListener('animationend', handleComplete);
                el.style.animation = '';
                if (options.onComplete) options.onComplete();
            };
            
            el.addEventListener('animationend', handleComplete);
        },

        /**
         * Generic animate function
         */
        animate: function(el, animationType, options = {}) {
            const animations = {
                fadeIn: () => this.fadeIn(el, options),
                fadeOut: () => this.fadeOut(el, options),
                slideIn: () => this.slideIn(el, options),
                slideOut: () => this.slideOut(el, options),
                scaleIn: () => this.scaleIn(el, options),
                scaleOut: () => this.scaleOut(el, options),
                bounce: () => this.keyframe(el, 'bounce', options),
                shake: () => this.keyframe(el, 'shake', options),
                pulse: () => this.keyframe(el, 'pulse', options),
                wobble: () => this.keyframe(el, 'wobble', options),
                swing: () => this.keyframe(el, 'swing', options),
                flip: () => this.keyframe(el, 'flip', options),
                heartbeat: () => this.keyframe(el, 'heartbeat', options),
                jello: () => this.keyframe(el, 'jello', options),
                tada: () => this.keyframe(el, 'tada', options),
                rubberBand: () => this.keyframe(el, 'rubber-band', options),
                flash: () => this.keyframe(el, 'flash', options),
                glow: () => this.keyframe(el, 'glow', options),
                rotateIn: () => this.keyframe(el, 'rotate-in', options),
                rotateOut: () => this.keyframe(el, 'rotate-out', options),
                zoomIn: () => this.keyframe(el, 'zoom-in', options),
                zoomOut: () => this.keyframe(el, 'zoom-out', options)
            };
            
            if (animations[animationType]) {
                animations[animationType]();
            } else {
                console.warn(`Unknown animation type: ${animationType}`);
            }
        }
    };

    // ============================================================================
    // THEME CARD ANIMATIONS
    // ============================================================================
    const card = {
        /**
         * Animate theme card entry
         */
        enter: function(cardElement, options = {}) {
            if (!cardElement || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            
            const duration = options.duration || window.Variables.animationDuration;
            cardElement.style.opacity = '0';
            cardElement.style.transform = 'scale(0.95) translateY(20px)';
            cardElement.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
            
            requestAnimationFrame(() => {
                setTimeout(() => {
                    cardElement.style.opacity = '1';
                    cardElement.style.transform = 'scale(1) translateY(0)';
                    setTimeout(() => {
                        if (options.onComplete) options.onComplete();
                    }, duration);
                }, options.delay || 50);
            });
        },

        /**
         * Animate theme card exit
         */
        exit: function(cardElement, options = {}) {
            if (!cardElement || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            
            const duration = options.duration || window.Variables.animationDuration;
            cardElement.style.transition = `all ${duration}ms ease`;
            cardElement.style.opacity = '0';
            cardElement.style.transform = 'scale(0.9) translateY(-20px)';
            
            setTimeout(() => {
                if (options.onComplete) options.onComplete();
            }, duration);
        },

        /**
         * Animate theme card hover
         */
        hover: function(cardElement, isHovering) {
            if (!cardElement || !window.Variables.allowAnimations) return;
            
            if (isHovering) {
                cardElement.style.transition = 'transform 200ms ease, box-shadow 200ms ease';
                cardElement.style.transform = 'translateY(-4px) scale(1.02)';
            } else {
                cardElement.style.transform = 'translateY(0) scale(1)';
            }
        }
    };

    // ============================================================================
    // MODAL/OVERLAY ANIMATIONS
    // ============================================================================
    const modal = {
        /**
         * Show modal with animation
         */
        show: function(overlayElement, dialogElement, options = {}) {
            if (!overlayElement || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            
            const duration = options.duration || window.Variables.animationDuration;
            overlayElement.style.opacity = '0';
            overlayElement.style.transition = `opacity ${duration}ms ease`;
            
            if (dialogElement) {
                dialogElement.style.transform = 'scale(0.9)';
                dialogElement.style.transition = `transform ${duration}ms ease`;
            }
            
            requestAnimationFrame(() => {
                overlayElement.style.opacity = '1';
                if (dialogElement) {
                    dialogElement.style.transform = 'scale(1)';
                }
                setTimeout(() => {
                    if (options.onComplete) options.onComplete();
                }, duration);
            });
        },

        /**
         * Hide modal with animation
         */
        hide: function(overlayElement, dialogElement, options = {}) {
            if (!overlayElement || !window.Variables.allowAnimations) {
                if (options.onComplete) options.onComplete();
                return;
            }
            
            const duration = options.duration || window.Variables.animationDuration;
            overlayElement.style.opacity = '0';
            
            if (dialogElement) {
                dialogElement.style.transform = 'scale(0.9)';
            }
            
            setTimeout(() => {
                if (options.onComplete) options.onComplete();
            }, duration);
        }
    };

    // ============================================================================
    // LOADING ANIMATIONS
    // ============================================================================
    const loading = {
        /**
         * Show loading overlay
         */
        show: function(container, message = 'Loading...', options = {}) {
            const existing = container.querySelector('.utils-loader-overlay');
            if (existing) existing.remove();
            
            const loader = document.createElement('div');
            loader.className = 'utils-loader-overlay';
            loader.innerHTML = `
                <div class="utils-loader-content">
                    <div class="utils-loader-spinner"></div>
                    <div class="utils-loader-message">${message}</div>
                </div>
            `;
            
            Object.assign(loader.style, {
                position: container === document.body ? 'fixed' : 'absolute',
                inset: '0',
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '100000',
                opacity: '0',
                transition: window.Variables.allowAnimations 
                    ? `opacity ${window.Variables.animationDuration}ms ease` 
                    : 'none'
            });
            
            container.appendChild(loader);
            
            if (window.Variables.allowAnimations) {
                requestAnimationFrame(() => {
                    loader.style.opacity = '1';
                });
            } else {
                loader.style.opacity = '1';
            }
            
            return loader;
        },

        /**
         * Hide loading overlay
         */
        hide: function(container, options = {}) {
            const loader = container.querySelector('.utils-loader-overlay');
            if (!loader) return;
            
            if (window.Variables.allowAnimations) {
                loader.style.opacity = '0';
                setTimeout(() => {
                    loader.remove();
                    if (options.onComplete) options.onComplete();
                }, window.Variables.animationDuration);
            } else {
                loader.remove();
                if (options.onComplete) options.onComplete();
            }
        }
    };

    // ============================================================================
    // EXPORT API
    // ============================================================================
    return {
        chip,
        element,
        card,
        modal,
        loading,
        
        // Convenience aliases
        fadeIn: (el, opt) => element.fadeIn(el, opt),
        fadeOut: (el, opt) => element.fadeOut(el, opt),
        slideIn: (el, opt) => element.slideIn(el, opt),
        slideOut: (el, opt) => element.slideOut(el, opt),
        scaleIn: (el, opt) => element.scaleIn(el, opt),
        scaleOut: (el, opt) => element.scaleOut(el, opt),
        animate: (el, type, opt) => element.animate(el, type, opt)
    };
})();

// =====================================================================
// WIDGET MODULES
// =====================================================================
window.Widgets = (() => {
    const widgetModules = {
        'yasb.clock.ClockWidget':
            `
            <style>
                .clock-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget clock-widget'>
                <span class="label widget-label"></span>
            </div>
            <script>
                (function() {
                    const labelEl = document.currentScript.previousElementSibling.querySelector('.label');
                    if (!labelEl.textContent) {
                        const updateTime = () => {
                            labelEl.textContent = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                        };
                        updateTime();
                        setInterval(updateTime, 1000);
                    }
                })();
            </script>
        `,
        'yasb.cpu.CpuWidget':
            `
            <style>
                .cpu-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget cpu-widget'>
                <span class="label widget-label">CPU 45%</span>
            </div>
        `,
        'yasb.memory.MemoryWidget':
            `
            <style>
                .memory-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget memory-widget'>
                <span class="label widget-label">MEM 62%</span>
            </div>
        `,
        'yasb.gpu.GpuWidget':
            `
            <style>
                .gpu-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget gpu-widget'>
                <span class="label widget-label">GPU 38%</span>
            </div>
        `,
        'yasb.disk.DiskWidget':
            `
            <style>
                .disk-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget disk-widget'>
                <span class="label widget-label">Disk</span>
            </div>
        `,
        'yasb.volume.VolumeWidget':
            `
            <style>
                .volume-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget volume-widget'>
                <span class="label widget-label">🔊</span>
            </div>
        `,
        'yasb.microphone.MicrophoneWidget':
            `
            <style>
                .microphone-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget microphone-widget'>
                <span class="label widget-label">🎤</span>
            </div>
        `,
        'yasb.battery.BatteryWidget':
            `
            <style>
                .battery-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget battery-widget'>
                <span class="label widget-label">🔋 85%</span>
            </div>
        `,
        'yasb.wifi.WifiWidget':
            `
            <style>
                .wifi-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget wifi-widget'>
                <span class="label widget-label">📶</span>
            </div>
        `,
        'yasb.bluetooth.BluetoothWidget':
            `
            <style>
                .bluetooth-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget bluetooth-widget'>
                <span class="label widget-label">🔵</span>
            </div>
        `,
        'yasb.media.MediaWidget':
            `
            <style>
                .media-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget media-widget'>
                <span class="label widget-label">▶️ Now Playing</span>
            </div>
        `,
        'yasb.notifications.NotificationsWidget':
            `
            <style>
                .notifications-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget notifications-widget'>
                <span class="label widget-label">🔔 3</span>
            </div>
        `,
        'yasb.active_window.ActiveWindowWidget':
            `
            <style>
                .active-window-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex: 1;
                    max-width: 300px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            </style>
            <div class='widget active-window-widget'>
                <span class="label widget-label">Active Window</span>
            </div>
        `,
        'komorebi.workspaces.WorkspaceWidget':
            `
            <style>
                .workspaces-widget {
                    padding: 2px 6px;
                    display: flex;
                    gap: 4px;
                }
                .workspace-item {
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    font-size: 11px;
                }
                .workspace-item.active {
                    background: var(--accent1, #00dfff);
                    color: var(--bg-dark, #000);
                }
                .workspace-item.inactive {
                    background: var(--bg-surface, rgba(22, 22, 38, 0.55));
                    color: var(--text-gray, #b0b0c8);
                }
            </style>
            <div class='widget workspaces-widget'>
                <span class="workspace-item active">1</span>
                <span class="workspace-item inactive">2</span>
                <span class="workspace-item inactive">3</span>
                <span class="workspace-item inactive">4</span>
                <span class="workspace-item inactive">5</span>
            </div>
        `,
        'yasb.systray.SystrayWidget':
            `
            <style>
                .systray-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
            </style>
            <div class='widget systray-widget'>
                <span>⚙️</span>
                <span>🔔</span>
                <span>📊</span>
            </div>
        `,
        'yasb.power_menu.PowerMenuWidget':
            `
            <style>
                .power-menu-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget power-menu-widget'>
                <span class="label widget-label">⏻</span>
            </div>
        `,
        'yasb.home.HomeWidget':
            `
            <style>
                .home-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget home-widget'>
                <span class="label widget-label">\uf192</span>
            </div>
        `,
        'yasb.applications.ApplicationsWidget':
            `
            <style>
                .applications-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget applications-widget'>
                <span class="label widget-label">📱</span>
            </div>
        `,
        'yasb.recycle_bin.RecycleBinWidget':
            `
            <style>
                .recycle-bin-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget recycle-bin-widget'>
                <span class="label widget-label">🗑️</span>
            </div>
        `,
        'yasb.custom.CustomWidget':
            `
            <style>
                .custom-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                }
            </style>
            <div class='widget custom-widget'>
                <span class="label widget-label">⚡</span>
            </div>
        `,
        'yasb.grouper.GrouperWidget':
            `
            <style>
                .grouper-widget {
                    padding: 2px;
                    display: flex;
                    gap: 4px;
                }
            </style>
            <div class='widget grouper-widget'>
                <!-- Grouped widgets will be inserted here -->
            </div>
        `,
        'yasb.cava.CavaWidget':
            `
            <style>
                .cava-widget {
                    padding: 4px 8px;
                    display: flex;
                    align-items: center;
                    gap: 2px;
                }
                .cava-bar {
                    width: 4px;
                    background: var(--accent2, #00dfff);
                    border-radius: 2px;
                }
            </style>
            <div class='widget cava-widget'>
                <div class="cava-bar" style="height: 8px;"></div>
                <div class="cava-bar" style="height: 14px;"></div>
                <div class="cava-bar" style="height: 20px;"></div>
                <div class="cava-bar" style="height: 16px;"></div>
                <div class="cava-bar" style="height: 12px;"></div>
                <div class="cava-bar" style="height: 18px;"></div>
                <div class="cava-bar" style="height: 10px;"></div>
                <div class="cava-bar" style="height: 15px;"></div>
            </div>
        `
    };
    return widgetModules;
})();