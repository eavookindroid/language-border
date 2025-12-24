# Language Border

GNOME Shell extension that adds a glow effect around windows, with color indicating the current keyboard layout.

![GNOME 47-49](https://img.shields.io/badge/GNOME-47--49-blue)
![License MIT](https://img.shields.io/badge/license-MIT-green)

## Features

- Glow effect around all windows
- Different settings for active and passive windows
- Per-language glow color (e.g., Russian = green, English = red)
- Customizable color, width, and intensity for each layout
- Settings panel via GNOME Extensions app

## Installation

### Debian/Ubuntu (.deb)

```bash
# Build from source
git clone https://github.com/eavookindroid/language-border.git
cd language-border
make release
sudo dpkg -i ../gnome-shell-extension-language-border_*_all.deb
```

Or download `.deb` from [Releases](https://github.com/eavookindroid/language-border/releases).

After install:
```bash
gnome-extensions enable language-border@artelofbots
```

### From source (development)

```bash
git clone https://github.com/eavookindroid/language-border.git
cd language-border
make install
```

Restart GNOME Shell:
- **X11:** `Alt+F2` → `r` → `Enter`
- **Wayland:** Log out and back in

## Configuration

```bash
gnome-extensions prefs language-border@artelofbots
```

Or via **Extensions** app → Language Border → Settings.

### Parameters

| Setting | Description | Range |
|---------|-------------|-------|
| **Active Window** | | |
| Color | Glow color for focused window | RGBA |
| Width | Glow spread in pixels | 5-50 px |
| Intensity | Glow brightness | 0-100% |
| **Passive Windows** | | |
| Color | Glow color for unfocused windows | RGBA |
| Width | Glow spread (0 = disabled) | 0-50 px |
| Intensity | Glow brightness | 0-100% |
| **Languages** | | |
| Per-Language Mode | Enable keyboard layout colors | on/off |

### Default language colors

- `ru` (Russian) → Green
- `us` (English) → Red

You can add more languages in the settings panel.

## Requirements

- GNOME Shell 47, 48, or 49
- For building: `dpkg-buildpackage`, `glib-compile-schemas`

## Build & Release

```bash
# Build deb from latest git tag
make release

# Just build deb (without version from tag)
make deb

# Build zip for extensions.gnome.org
make zip

# Clean build artifacts
make clean
```

### Versioning

Version is driven by git tags:

```bash
git tag -a 1.1 -m "Release notes here"
make release
```

## Debugging

```bash
# View logs
journalctl -f -o cat /usr/bin/gnome-shell

# Reset settings
dconf reset -f /org/gnome/shell/extensions/language-border/
```

## Uninstall

```bash
# If installed from source
make uninstall

# If installed from deb
sudo apt remove gnome-shell-extension-language-border
```

## Project Structure

```
language-border/
├── language-border@artelofbots/   # Extension
│   ├── extension.js               # Main logic
│   ├── prefs.js                   # Settings panel (Adwaita)
│   ├── metadata.json              # Extension metadata
│   ├── stylesheet.css             # CSS styles
│   └── schemas/                   # GSettings schema
├── debian/                        # Debian packaging
├── scripts/
│   └── release.sh                 # Release script
├── Makefile                       # Build commands
├── LICENSE                        # MIT
└── README.md
```

## Author

**© Artel of Bots**

## License

[MIT](LICENSE)
