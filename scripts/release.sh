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

# Get tag annotation message (release notes)
TAG_MESSAGE=$(git tag -l --format='%(contents)' "$LATEST_TAG" | head -20)

if [ -z "$TAG_MESSAGE" ]; then
    TAG_MESSAGE="Release $VERSION"
fi

# Get tag date
TAG_DATE=$(git log -1 --format=%aD "$LATEST_TAG")

# Get maintainer from debian/control
MAINTAINER=$(grep -oP 'Maintainer: \K[^<]+' debian/control | sed 's/ *$//' || echo "Artel of Bots")
EMAIL=$(grep -oP 'Maintainer:.*<\K[^>]+' debian/control || echo "artelofbots@nowhere.funny")

echo "=== Release Info ==="
echo "Tag: $LATEST_TAG"
echo "Version: $VERSION"
echo "Date: $TAG_DATE"
echo "Message:"
echo "$TAG_MESSAGE"
echo "===================="

# Generate new changelog entry
NEW_ENTRY="gnome-shell-extension-language-border ($VERSION-1) unstable; urgency=medium

"

# Add each line of tag message as changelog item
while IFS= read -r line; do
    if [ -n "$line" ]; then
        NEW_ENTRY+="  * $line
"
    fi
done <<< "$TAG_MESSAGE"

NEW_ENTRY+="
 -- $MAINTAINER <$EMAIL>  $TAG_DATE
"

# Check if this version already exists in changelog
if grep -q "($VERSION-1)" debian/changelog 2>/dev/null; then
    echo "Version $VERSION-1 already in changelog, skipping update"
else
    echo "Updating debian/changelog..."

    # Prepend new entry to changelog
    echo "$NEW_ENTRY" | cat - debian/changelog > debian/changelog.new
    mv debian/changelog.new debian/changelog
fi

# Update metadata.json version (integer part only)
META_VERSION=$(echo "$VERSION" | cut -d. -f1)
sed -i "s/\"version\": [0-9]*/\"version\": $META_VERSION/" language-border@artelofbots/metadata.json

echo "Building deb package..."
dpkg-buildpackage -us -uc -b

echo ""
echo "=== Done ==="
echo "Package: ../gnome-shell-extension-language-border_${VERSION}-1_all.deb"
