#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Usage: test-isolated.sh /reviewed/age-directory
# bwrap needs working network namespaces. Some hosts require sudo for bwrap.
set -eu
AGE_DIR=$(realpath "$1")
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
STAGE_PARENT=${MEOS_TEST_STAGE_PARENT:-"$SOURCE_DIR/../.."}
if [ -x /usr/local/bin/build-space-check ]; then
  /usr/local/bin/build-space-check --path "$STAGE_PARENT" --required-mib 40
else
  python3 - "$STAGE_PARENT" <<'SPACE'
import shutil, sys
if shutil.disk_usage(sys.argv[1]).free < 5 * 1024**3 + 40 * 1024**2:
    raise SystemExit('insufficient qualification space plus 5 GiB reserve')
SPACE
fi
STAGE_DIR=$(mktemp -d "$STAGE_PARENT/.meos-backup-proof.XXXXXX")
trap 'rm -rf "$STAGE_DIR"' EXIT HUP INT TERM
cp -R "$SOURCE_DIR" "$STAGE_DIR/code"
cp -R "$AGE_DIR" "$STAGE_DIR/age"
cp "$SOURCE_DIR/../../scripts/calendar-upgrade.py" "$STAGE_DIR/upgrade.py"
chmod -R a+rX "$STAGE_DIR"
# The isolated runner is root; model root-owned installed public executables.
sudo chown 0:0 "$STAGE_DIR/age/age" "$STAGE_DIR/age/age-keygen" "$STAGE_DIR/age/age-admission.json"
sudo bwrap --unshare-all --die-with-parent \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --symlink usr/bin /bin --proc /proc --dev /dev --tmpfs /tmp --tmpfs /proof \
  --ro-bind "$STAGE_DIR/code" /code --ro-bind "$STAGE_DIR/age" /age \
  --ro-bind "$STAGE_DIR/upgrade.py" /upgrade.py \
  --clearenv --setenv PATH /usr/bin:/bin --setenv MEOS_TEST_AGE /age/age \
  --setenv PYTHONDONTWRITEBYTECODE 1 /usr/bin/python3 -m unittest discover -s /code -p 'test_*.py'
