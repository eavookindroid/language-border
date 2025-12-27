#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Get latest annotated tag by commit date
LATEST_TAG=$(git tag -l --sort=-creatordate | head -1)

if [ -z "$LATEST_TAG" ]; then
    echo "Error: No tags found. Create one:"
    echo "  git tag -a 1.0 -m 'Initial release'"
    exit 1
fi

# Tag is the version (no 'v' prefix)
VERSION="$LATEST_TAG"

# Get tag date
TAG_DATE=$(git log -1 --format=%aD "$LATEST_TAG")

echo "=== Release Info ==="
echo "Tag: $LATEST_TAG"
echo "Version: $VERSION"
echo "Date: $TAG_DATE"
echo "===================="

echo "Generating debian/changelog from annotated tags..."
./scripts/gen-changelog.sh

# Update metadata.json version (integer part only)
META_VERSION=$(echo "$VERSION" | cut -d. -f1)
sed -i "s/\"version\": [0-9]*/\"version\": $META_VERSION/" language-border@artelofbots/metadata.json

echo "Building deb package..."
dpkg-buildpackage -us -uc -b

echo ""
echo "=== Done ==="
echo "Package: ../gnome-shell-extension-language-border_${VERSION}-1_all.deb"
