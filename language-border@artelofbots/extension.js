import St from 'gi://St';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Keyboard from 'resource:///org/gnome/shell/ui/status/keyboard.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// Debug logging to file
function debugLog(msg) {
    try {
        const file = Gio.File.new_for_path('/tmp/language-border.log');
        const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
        const timestamp = new Date().toISOString();
        stream.write_all(`[${timestamp}] ${msg}\n`, null);
        stream.close(null);
    } catch (e) {}
}

class WindowGlowManager {
    constructor(extension) {
        this._extension = extension;
        this._settings = extension.getSettings();
        this._windowData = new Map();
        this._signalIds = [];
        this._settingsSignalIds = [];
        this._inputSourceManager = null;
        this._inputSourceSignalId = null;
    }

    enable() {
        this._signalIds.push(
            global.display.connect('window-created', this._onWindowCreated.bind(this))
        );
        this._signalIds.push(
            global.display.connect('notify::focus-window', this._onFocusChanged.bind(this))
        );
        this._signalIds.push(
            global.display.connect('restacked', this._onRestacked.bind(this))
        );
        this._signalIds.push(
            global.workspace_manager.connect('active-workspace-changed', this._onWorkspaceChanged.bind(this))
        );

        this._settingsSignalIds.push(
            this._settings.connect('changed', this._onSettingsChanged.bind(this))
        );

        // Connect to input source (keyboard layout) changes
        this._inputSourceManager = Keyboard.getInputSourceManager();
        debugLog(`InputSourceManager: ${this._inputSourceManager ? 'FOUND' : 'NOT FOUND'}`);

        if (this._inputSourceManager) {
            debugLog(`Current source: ${this._inputSourceManager.currentSource?.id}`);

            // Connect to current-source-changed signal
            try {
                this._inputSourceSignalId = this._inputSourceManager.connect(
                    'current-source-changed',
                    this._onInputSourceChanged.bind(this)
                );
                debugLog(`Connected to current-source-changed signal`);
            } catch (e) {
                debugLog(`Failed to connect: ${e}`);
            }
        }

        // Also watch GSettings for input source changes (fallback)
        this._inputSourceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.input-sources' });
        this._inputSourceSettingsId = this._inputSourceSettings.connect('changed::current', () => {
            debugLog(`GSettings current changed!`);
            this._onInputSourceChanged();
        });
        debugLog(`Extension enabled, watching for input source changes`);

        for (const actor of global.get_window_actors()) {
            this._addBorderToWindow(actor);
        }

        this._onFocusChanged();
    }

    disable() {
        // Disconnect input source signal
        if (this._inputSourceManager && this._inputSourceSignalId) {
            this._inputSourceManager.disconnect(this._inputSourceSignalId);
            this._inputSourceSignalId = null;
        }
        this._inputSourceManager = null;

        // Disconnect GSettings signal
        if (this._inputSourceSettings && this._inputSourceSettingsId) {
            this._inputSourceSettings.disconnect(this._inputSourceSettingsId);
            this._inputSourceSettingsId = null;
        }
        this._inputSourceSettings = null;

        for (const id of this._signalIds) {
            try {
                global.display.disconnect(id);
            } catch (e) {
                try {
                    global.workspace_manager.disconnect(id);
                } catch (e2) {}
            }
        }
        this._signalIds = [];

        for (const id of this._settingsSignalIds) {
            this._settings.disconnect(id);
        }
        this._settingsSignalIds = [];

        for (const [actor] of this._windowData) {
            this._removeBorder(actor);
        }
        this._windowData.clear();
    }

    _onInputSourceChanged() {
        // When keyboard layout changes, update the active window's border
        const langId = this._getCurrentInputSourceId();
        debugLog(`INPUT SOURCE CHANGED TO: ${langId}`);
        this._onFocusChanged();
    }

    _onRestacked() {
        for (const [actor, data] of this._windowData) {
            this._ensureBorderBelowActor(actor, data.border);
        }
    }

    _onWorkspaceChanged() {
        this._onFocusChanged();
    }

    _onWindowCreated(display, window) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            const actor = window.get_compositor_private();
            if (actor) {
                this._addBorderToWindow(actor);
                this._onFocusChanged();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _onFocusChanged() {
        const focusWindow = global.display.get_focus_window();
        const focusActor = focusWindow?.get_compositor_private();

        for (const [actor, data] of this._windowData) {
            const isActive = actor === focusActor;
            this._updateBorder(actor, isActive);
        }
    }

    _onSettingsChanged() {
        this._onFocusChanged();
    }

    _shouldSkipWindow(metaWindow) {
        if (!metaWindow) return true;

        const windowType = metaWindow.get_window_type();
        const skipTypes = [
            Meta.WindowType.DESKTOP,
            Meta.WindowType.DOCK,
            Meta.WindowType.MENU,
            Meta.WindowType.DROPDOWN_MENU,
            Meta.WindowType.POPUP_MENU,
            Meta.WindowType.TOOLTIP,
            Meta.WindowType.NOTIFICATION,
            Meta.WindowType.COMBO,
            Meta.WindowType.DND,
            Meta.WindowType.OVERRIDE_OTHER,
        ];

        return skipTypes.includes(windowType);
    }

    _isWindowOnCurrentWorkspace(metaWindow) {
        if (!metaWindow) return false;
        const currentWorkspace = global.workspace_manager.get_active_workspace();
        const windowWorkspace = metaWindow.get_workspace();
        return windowWorkspace === currentWorkspace || metaWindow.is_on_all_workspaces();
    }

    _getCurrentInputSourceId() {
        // Try InputSourceManager first
        if (this._inputSourceManager?.currentSource?.id) {
            return this._inputSourceManager.currentSource.id;
        }

        // Fallback: read from GSettings
        try {
            const sources = this._inputSourceSettings.get_value('sources').deep_unpack();
            const current = this._inputSourceSettings.get_uint('current');
            if (sources && sources[current]) {
                const [type, id] = sources[current];
                return id; // e.g. "us", "ru"
            }
        } catch (e) {
            log(`[LanguageBorder] Error getting input source: ${e}`);
        }

        return null;
    }

    _getLanguageSettings() {
        try {
            const jsonStr = this._settings.get_string('language-settings');
            return JSON.parse(jsonStr);
        } catch (e) {
            return {};
        }
    }

    _ensureBorderBelowActor(actor, border) {
        if (border && border.get_parent() && actor.get_parent()) {
            const parent = border.get_parent();
            parent.set_child_below_sibling(border, actor);
        }
    }

    _addBorderToWindow(actor) {
        const metaWindow = actor.get_meta_window();
        if (this._shouldSkipWindow(metaWindow)) return;
        if (this._windowData.has(actor)) return;

        const border = new St.Widget({
            reactive: false,
            can_focus: false,
            track_hover: false,
            style: 'background: transparent;',
        });

        global.window_group.insert_child_below(border, actor);

        const syncGeometry = () => {
            if (!metaWindow || !border || !actor) return;

            const rect = metaWindow.get_frame_rect();
            if (!rect) return;

            const focusWindow = global.display.get_focus_window();
            const isActive = focusWindow?.get_compositor_private() === actor;
            const width = this._getEffectiveWidth(isActive);

            border.set_position(rect.x - width, rect.y - width);
            border.set_size(rect.width + width * 2, rect.height + width * 2);
        };

        const signals = [];
        signals.push({ obj: metaWindow, id: metaWindow.connect('position-changed', syncGeometry) });
        signals.push({ obj: metaWindow, id: metaWindow.connect('size-changed', syncGeometry) });
        signals.push({ obj: metaWindow, id: metaWindow.connect('workspace-changed', () => this._onFocusChanged()) });

        const destroyId = actor.connect('destroy', () => {
            this._removeBorder(actor);
        });

        this._windowData.set(actor, {
            border,
            metaWindow,
            signals,
            destroyId,
            syncGeometry,
        });

        syncGeometry();
    }

    _getEffectiveWidth(isActive) {
        const perLanguageMode = this._settings.get_boolean('per-language-mode');

        if (perLanguageMode && isActive) {
            const langId = this._getCurrentInputSourceId();
            const langSettings = this._getLanguageSettings();

            if (langId && langSettings[langId]) {
                return langSettings[langId].width || this._settings.get_int('active-width');
            }
        }

        return this._settings.get_int(isActive ? 'active-width' : 'passive-width');
    }

    _getEffectiveColor(isActive) {
        const perLanguageMode = this._settings.get_boolean('per-language-mode');

        if (perLanguageMode && isActive) {
            const langId = this._getCurrentInputSourceId();
            const langSettings = this._getLanguageSettings();

            console.log(`[LanguageBorder] perLanguageMode=${perLanguageMode}, langId=${langId}, hasSettings=${!!langSettings[langId]}`);

            if (langId && langSettings[langId]) {
                console.log(`[LanguageBorder] Using color for ${langId}: ${langSettings[langId].color}`);
                return langSettings[langId].color || this._settings.get_string('active-color');
            }
        }

        return this._settings.get_string(isActive ? 'active-color' : 'passive-color');
    }

    _getEffectiveIntensity(isActive) {
        const perLanguageMode = this._settings.get_boolean('per-language-mode');

        if (perLanguageMode && isActive) {
            const langId = this._getCurrentInputSourceId();
            const langSettings = this._getLanguageSettings();

            if (langId && langSettings[langId]) {
                return langSettings[langId].intensity || this._settings.get_int('active-intensity');
            }
        }

        return this._settings.get_int(isActive ? 'active-intensity' : 'passive-intensity');
    }

    _updateBorder(actor, isActive) {
        const data = this._windowData.get(actor);
        if (!data) return;

        const { border, metaWindow, syncGeometry } = data;
        if (!metaWindow || !border) return;

        if (!this._isWindowOnCurrentWorkspace(metaWindow)) {
            border.visible = false;
            return;
        }

        const color = this._getEffectiveColor(isActive);
        const width = this._getEffectiveWidth(isActive);
        const intensity = this._getEffectiveIntensity(isActive);

        if (width === 0 || intensity === 0) {
            border.visible = false;
            return;
        }

        border.visible = true;

        // Update geometry with current width
        const rect = metaWindow.get_frame_rect();
        if (rect) {
            border.set_position(rect.x - width, rect.y - width);
            border.set_size(rect.width + width * 2, rect.height + width * 2);
        }

        this._ensureBorderBelowActor(actor, border);

        const blur = Math.max(width, 8);
        const spread = Math.floor(width / 2);
        const adjustedColor = this._adjustColorIntensity(color, intensity);

        border.set_style(`
            background: transparent;
            border-radius: 12px;
            box-shadow: 0 0 ${blur}px ${spread}px ${adjustedColor};
        `);
    }

    _adjustColorIntensity(colorStr, intensity) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const baseAlpha = parseFloat(match[4] || '1');
            const adjustedAlpha = baseAlpha * (intensity / 100);
            return `rgba(${r}, ${g}, ${b}, ${adjustedAlpha.toFixed(2)})`;
        }
        return colorStr;
    }

    _removeBorder(actor) {
        const data = this._windowData.get(actor);
        if (!data) return;

        const { border, signals, destroyId } = data;

        for (const sig of signals) {
            try {
                if (sig.obj && GObject.signal_handler_is_connected(sig.obj, sig.id)) {
                    sig.obj.disconnect(sig.id);
                }
            } catch (e) {}
        }

        try {
            if (actor && GObject.signal_handler_is_connected(actor, destroyId)) {
                actor.disconnect(destroyId);
            }
        } catch (e) {}

        if (border) {
            border.destroy();
        }

        this._windowData.delete(actor);
    }
}

export default class LanguageBorderExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._glowManager = null;
    }

    enable() {
        this._glowManager = new WindowGlowManager(this);
        this._glowManager.enable();
    }

    disable() {
        if (this._glowManager) {
            this._glowManager.disable();
            this._glowManager = null;
        }
    }
}
