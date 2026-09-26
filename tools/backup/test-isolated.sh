#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Usage: test-isolated.sh /reviewed/age-directory
# bwrap needs working network namespaces. Some hosts require sudo for bwrap.
set -eu
AGE_DIR=$(realpath "$1")
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STAGE_PARENT=${MEOS_TEST_STAGE_PARENT:-"$SOURCE_DIR/../.."}
/usr/local/bin/build-space-check --path "$STAGE_PARENT" --required-mib 40
STAGE_DIR=$(mktemp -d "$STAGE_PARENT/.meos-backup-proof.XXXXXX")
trap 'rm -rf "$STAGE_DIR"' EXIT HUP INT TERM
cp -R "$SOURCE_DIR" "$STAGE_DIR/code"
cp -R "$AGE_DIR" "$STAGE_DIR/age"
cp "$SOURCE_DIR/../../scripts/calendar-upgrade.py" "$STAGE_DIR/upgrade.py"
chmod -R a+rX "$STAGE_DIR"
sudo bwrap --unshare-all --die-with-parent \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --symlink usr/bin /bin --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$STAGE_DIR/code" /code --ro-bind "$STAGE_DIR/age" /age \
  --ro-bind "$STAGE_DIR/upgrade.py" /upgrade.py \
  --clearenv --setenv PATH /usr/bin:/bin --setenv MEOS_TEST_AGE /age/age \
  --setenv PYTHONDONTWRITEBYTECODE 1 /usr/bin/python3 /code/test_backup.py
