.PHONY: all build install uninstall clean deb zip release

EXTENSION_UUID = language-border@artelofbots
VERSION = $(shell git describe --tags --abbrev=0 2>/dev/null || echo "1.0")
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(EXTENSION_UUID)
SCHEMA_DIR = /usr/share/glib-2.0/schemas

all: build

build:
	glib-compile-schemas $(EXTENSION_UUID)/schemas/

install: build
	mkdir -p $(EXTENSION_DIR)
	cp -r $(EXTENSION_UUID)/* $(EXTENSION_DIR)/
	gnome-extensions enable $(EXTENSION_UUID)

uninstall:
	gnome-extensions disable $(EXTENSION_UUID) || true
	rm -rf $(EXTENSION_DIR)

clean:
	rm -rf build/
	rm -f *.deb
	rm -f $(EXTENSION_UUID)/schemas/gschemas.compiled
	rm -rf debian/.debhelper
	rm -f debian/debhelper-build-stamp
	rm -f debian/files
	rm -rf debian/gnome-shell-extension-language-border
	rm -f debian/*.substvars

deb:
	./scripts/gen-changelog.sh
	dpkg-buildpackage -us -uc -b

zip:
	cd $(EXTENSION_UUID) && zip -r ../$(EXTENSION_UUID).zip . -x "*.git*" -x "schemas/gschemas.compiled"

# Release: get latest tag, update changelog, build deb
# Usage: git tag -a 1.1 -m "Release notes here" && make release
release:
	./scripts/release.sh
