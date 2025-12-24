import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LanguageBorderPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings();
        this._window = window;

        // Active window page
        const activePage = new Adw.PreferencesPage({
            title: 'Active Window',
            icon_name: 'focus-windows-symbolic',
        });
        window.add(activePage);

        const activeGroup = new Adw.PreferencesGroup({
            title: 'Active Window Glow',
            description: 'Settings for the focused window',
        });
        activePage.add(activeGroup);

        activeGroup.add(this._createColorRow('active-color', 'Color', 'Glow color'));
        activeGroup.add(this._createSpinRow('active-width', 'Width', 'Glow width in pixels', 5, 50, 1));
        activeGroup.add(this._createSpinRow('active-intensity', 'Intensity', 'Glow brightness (0-100%)', 0, 100, 5));

        // Passive window page
        const passivePage = new Adw.PreferencesPage({
            title: 'Passive Windows',
            icon_name: 'window-new-symbolic',
        });
        window.add(passivePage);

        const passiveGroup = new Adw.PreferencesGroup({
            title: 'Passive Windows Glow',
            description: 'Settings for unfocused windows (set width to 0 to disable)',
        });
        passivePage.add(passiveGroup);

        passiveGroup.add(this._createColorRow('passive-color', 'Color', 'Glow color'));
        passiveGroup.add(this._createSpinRow('passive-width', 'Width', 'Glow width (0 = disabled)', 0, 50, 1));
        passiveGroup.add(this._createSpinRow('passive-intensity', 'Intensity', 'Glow brightness (0-100%)', 0, 100, 5));

        // Languages page
        const langPage = new Adw.PreferencesPage({
            title: 'Languages',
            icon_name: 'input-keyboard-symbolic',
        });
        window.add(langPage);

        // Per-language mode toggle
        const modeGroup = new Adw.PreferencesGroup({
            title: 'Per-Language Mode',
            description: 'When enabled, active window glow color changes based on keyboard layout',
        });
        langPage.add(modeGroup);

        const perLanguageRow = new Adw.SwitchRow({
            title: 'Enable Per-Language Glow',
            subtitle: 'Switch keyboard layout to change glow color',
        });
        this._settings.bind('per-language-mode', perLanguageRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        modeGroup.add(perLanguageRow);

        // Language settings
        this._langGroup = new Adw.PreferencesGroup({
            title: 'Language Colors',
            description: 'Configure glow for each keyboard layout',
        });
        langPage.add(this._langGroup);

        // Track added rows for proper cleanup
        this._languageRows = [];

        this._rebuildLanguageRows();

        // Listen for settings changes (only for add/remove, not updates)
        this._settingsChangedId = this._settings.connect('changed::language-settings', () => {
            // Only rebuild if number of languages changed
            const langSettings = this._getLanguageSettings();
            if (Object.keys(langSettings).length !== this._languageRows.length) {
                this._rebuildLanguageRows();
            }
        });

        // Add language button
        const addGroup = new Adw.PreferencesGroup();
        langPage.add(addGroup);

        const addRow = new Adw.ActionRow({
            title: 'Add Language',
            subtitle: 'Add settings for a new keyboard layout',
        });

        const addEntry = new Gtk.Entry({
            placeholder_text: 'e.g. de, fr, ua',
            valign: Gtk.Align.CENTER,
            width_chars: 8,
        });

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });

        addButton.connect('clicked', () => {
            const langId = addEntry.get_text().trim().toLowerCase();
            if (langId && langId.length > 0) {
                this._addLanguage(langId);
                addEntry.set_text('');
            }
        });

        addRow.add_suffix(addEntry);
        addRow.add_suffix(addButton);
        addGroup.add(addRow);
    }

    _rebuildLanguageRows() {
        // Remove all tracked rows
        for (const row of this._languageRows) {
            this._langGroup.remove(row);
        }
        this._languageRows = [];

        // Get current language settings
        const langSettings = this._getLanguageSettings();

        // Add row for each language
        for (const [langId, settings] of Object.entries(langSettings)) {
            const expander = new Adw.ExpanderRow({
                title: langId.toUpperCase(),
                subtitle: `Color: ${settings.color}`,
            });

            // Color row
            const colorRow = new Adw.ActionRow({ title: 'Color' });
            const colorButton = new Gtk.ColorButton({
                valign: Gtk.Align.CENTER,
                use_alpha: true,
            });

            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.color)) {
                colorButton.set_rgba(rgba);
            }

            colorButton.connect('color-set', () => {
                const newRgba = colorButton.get_rgba();
                const newColor = `rgba(${Math.round(newRgba.red * 255)}, ${Math.round(newRgba.green * 255)}, ${Math.round(newRgba.blue * 255)}, ${newRgba.alpha.toFixed(2)})`;
                this._updateLanguageSetting(langId, 'color', newColor);
                expander.set_subtitle(`Color: ${newColor}`);
            });

            colorRow.add_suffix(colorButton);
            expander.add_row(colorRow);

            // Width row
            const widthRow = new Adw.ActionRow({ title: 'Width' });
            const widthSpin = new Gtk.SpinButton({
                adjustment: new Gtk.Adjustment({
                    lower: 5,
                    upper: 50,
                    step_increment: 1,
                    value: settings.width || 20,
                }),
                valign: Gtk.Align.CENTER,
            });

            widthSpin.connect('value-changed', () => {
                this._updateLanguageSetting(langId, 'width', widthSpin.get_value());
            });

            widthRow.add_suffix(widthSpin);
            expander.add_row(widthRow);

            // Intensity row
            const intensityRow = new Adw.ActionRow({ title: 'Intensity' });
            const intensitySpin = new Gtk.SpinButton({
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 5,
                    value: settings.intensity || 70,
                }),
                valign: Gtk.Align.CENTER,
            });

            intensitySpin.connect('value-changed', () => {
                this._updateLanguageSetting(langId, 'intensity', intensitySpin.get_value());
            });

            intensityRow.add_suffix(intensitySpin);
            expander.add_row(intensityRow);

            // Delete button
            const deleteRow = new Adw.ActionRow({ title: 'Remove this language' });
            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['destructive-action'],
            });

            deleteButton.connect('clicked', () => {
                this._removeLanguage(langId);
            });

            deleteRow.add_suffix(deleteButton);
            expander.add_row(deleteRow);

            this._langGroup.add(expander);
            this._languageRows.push(expander);
        }
    }

    _getLanguageSettings() {
        try {
            const jsonStr = this._settings.get_string('language-settings');
            return JSON.parse(jsonStr);
        } catch (e) {
            return {};
        }
    }

    _saveLanguageSettings(langSettings) {
        this._settings.set_string('language-settings', JSON.stringify(langSettings));
    }

    _addLanguage(langId) {
        const langSettings = this._getLanguageSettings();
        if (!langSettings[langId]) {
            langSettings[langId] = {
                color: 'rgba(255, 255, 0, 0.8)',
                width: 20,
                intensity: 70,
            };
            this._saveLanguageSettings(langSettings);
        }
    }

    _removeLanguage(langId) {
        const langSettings = this._getLanguageSettings();
        delete langSettings[langId];
        this._saveLanguageSettings(langSettings);
    }

    _updateLanguageSetting(langId, key, value) {
        const langSettings = this._getLanguageSettings();
        if (langSettings[langId]) {
            langSettings[langId][key] = value;
            this._saveLanguageSettings(langSettings);
        }
    }

    _createColorRow(key, title, subtitle) {
        const row = new Adw.ActionRow({ title, subtitle });

        const colorButton = new Gtk.ColorButton({
            valign: Gtk.Align.CENTER,
            use_alpha: true,
        });

        const colorStr = this._settings.get_string(key);
        const rgba = new Gdk.RGBA();
        if (rgba.parse(colorStr)) {
            colorButton.set_rgba(rgba);
        }

        colorButton.connect('color-set', () => {
            const newRgba = colorButton.get_rgba();
            const newColorStr = `rgba(${Math.round(newRgba.red * 255)}, ${Math.round(newRgba.green * 255)}, ${Math.round(newRgba.blue * 255)}, ${newRgba.alpha.toFixed(2)})`;
            this._settings.set_string(key, newColorStr);
        });

        row.add_suffix(colorButton);
        row.activatable_widget = colorButton;

        return row;
    }

    _createSpinRow(key, title, subtitle, min, max, step) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: step,
                page_increment: step * 10,
                value: this._settings.get_int(key),
            }),
        });

        this._settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);

        return row;
    }
}
