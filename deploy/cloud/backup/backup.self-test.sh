#!/bin/sh
set -eu

. "$(dirname "$0")/backup-lib.sh"

actual=$(printf '%s\n' a b c d e | retention_candidates 3)
test "$actual" = "a
b"

actual=$(promotion_periods 2026-09-15T00-00-00Z)
test "$actual" = "daily:2026-09-15
weekly:2026-W38
monthly:2026-09"

printf 'backup_self_test_ok\n'
