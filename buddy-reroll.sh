#!/usr/bin/env bash
set -euo pipefail

# Claude Code Buddy Reroller
# Preview and patch your companion by swapping the deterministic salt in the binary.
# Rolls are per-user (tied to your account UUID), so results are unique to you.
#
# Requires: bun, jq, perl, codesign (macOS)
#
# Usage:
#   buddy-reroll search "legendary shiny duck propeller"   Find matching rolls
#   buddy-reroll search "epic cat"                         Species + rarity
#   buddy-reroll search "shiny"                            Any shiny
#   buddy-reroll patch <SALT>                              Apply a salt from search
#   buddy-reroll current                                   Show your current roll
#   buddy-reroll restore                                   Undo patch

ORIGINAL_SALT="friend-2026-401"
SALT_LEN=${#ORIGINAL_SALT}

CLAUDE_LINK="${CLAUDE_LINK:-$HOME/.local/bin/claude}"
CLAUDE_VERSIONED="$(readlink "$CLAUDE_LINK" 2>/dev/null || echo "$CLAUDE_LINK")"
CLAUDE_BACKUP="${CLAUDE_VERSIONED}.bak"

get_config_path() {
  if [[ -f "${HOME}/.claude.json" ]]; then
    echo "${HOME}/.claude.json"
  elif [[ -f "${HOME}/.claude/.config.json" ]]; then
    echo "${HOME}/.claude/.config.json"
  else
    echo "error: no claude config found" >&2; exit 1
  fi
}

get_user_id() {
  jq -r '.oauthAccount.accountUuid // .userID // "anon"' "$(get_config_path)"
}

get_current_salt() {
  if grep -q "$ORIGINAL_SALT" "$CLAUDE_VERSIONED" 2>/dev/null; then
    echo "$ORIGINAL_SALT"
  elif [[ -f "${CLAUDE_VERSIONED}.salt" ]]; then
    cat "${CLAUDE_VERSIONED}.salt"
  else
    echo "$ORIGINAL_SALT"
  fi
}

clear_companion_cache() {
  local config tmp
  config="$(get_config_path)"
  tmp="${config}.tmp"
  jq 'del(.companion)' "$config" > "$tmp" && mv "$tmp" "$config"
}

run_roller() {
  local user_id="$1" mode="$2" query="$3" salt="$4"
  USER_ID="$user_id" MODE="$mode" QUERY="$query" FIXED_SALT="$salt" SALT_LEN="$SALT_LEN" bun run - <<'ROLLER'
const USER_ID = process.env.USER_ID ?? 'anon';
const SPECIES = ['duck','goose','blob','cat','dragon','octopus','owl','penguin',
  'turtle','snail','ghost','axolotl','capybara','cactus','robot','rabbit','mushroom','chonk'];
const EYES = ['·','✦','×','◉','@','°'];
const HATS = ['none','crown','tophat','propeller','halo','wizard','beanie','tinyduck'];
const RARITIES = ['common','uncommon','rare','epic','legendary'];
const RARITY_WEIGHTS = { common:60, uncommon:25, rare:10, epic:4, legendary:1 };
const STAT_NAMES = ['DEBUGGING','PATIENCE','CHAOS','WISDOM','SNARK'];
const RARITY_FLOOR = { common:5, uncommon:15, rare:25, epic:35, legendary:50 };
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(s) {
  if (typeof Bun !== 'undefined') return Number(BigInt(Bun.hash(s)) & 0xffffffffn);
  console.error('ERROR: bun required for accurate predictions'); process.exit(1);
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function rollRarity(rng) {
  let roll = rng() * 100;
  for (const r of RARITIES) { roll -= RARITY_WEIGHTS[r]; if (roll < 0) return r; }
  return 'common';
}
function rollStats(rng, rarity) {
  const floor = RARITY_FLOOR[rarity];
  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);
  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === peak) stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    else if (name === dump) stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    else stats[name] = floor + Math.floor(rng() * 40);
  }
  return stats;
}
function rollWithSalt(salt) {
  const rng = mulberry32(hashString(USER_ID + salt));
  const rarity = rollRarity(rng);
  return {
    salt, rarity, species: pick(rng, SPECIES), eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01, stats: rollStats(rng, rarity),
  };
}
function fmt(r) {
  const s = r.shiny ? ' SHINY' : '';
  const stats = STAT_NAMES.map(n => n + ':' + r.stats[n]).join(' ');
  return '[' + r.salt + '] ' + r.rarity.toUpperCase() + ' ' + r.species + ' ' + r.eye +
    ' hat:' + r.hat + s + '  ' + stats;
}
function matches(r, terms) {
  const haystack = (r.rarity + ' ' + r.species + ' ' + r.hat +
    (r.shiny ? ' shiny' : '') + ' ' +
    STAT_NAMES.map(n => n + ':' + r.stats[n]).join(' ')).toLowerCase();
  return terms.every(t => haystack.includes(t));
}
const mode = process.env.MODE ?? '';
const query = process.env.QUERY ?? '';
const fixedSalt = process.env.FIXED_SALT ?? '';
const saltLen = Number(process.env.SALT_LEN ?? 0);
if (mode === 'current') {
  console.log(fmt(rollWithSalt(fixedSalt)));
  process.exit(0);
}
const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
const crypto = require('node:crypto');
const BATCH = 1_000_000;
const TARGET = 25;
let found = 0;
let searched = 0;
while (found < TARGET) {
  for (let i = 0; i < BATCH; i++) {
    const salt = crypto.randomBytes(8).toString('hex').slice(0, saltLen);
    const r = rollWithSalt(salt);
    if (matches(r, terms)) { console.log(fmt(r)); found++; if (found >= TARGET) break; }
  }
  searched += BATCH;
  if (found < TARGET) process.stderr.write('searched ' + searched.toLocaleString() + ' so far (' + found + ' found)...\n');
  if (searched >= 100_000_000) { process.stderr.write('gave up after 100M rolls\n'); break; }
}
ROLLER
}

cmd_search() {
  local query="${1:-}"
  if [[ -z "$query" ]]; then
    echo "Usage: $0 search \"legendary shiny duck propeller\"" >&2
    exit 1
  fi
  local user_id
  user_id="$(get_user_id)"
  echo "Searching for: ${query}"
  echo "User: ${user_id:0:8}..."
  echo "---"
  run_roller "$user_id" "search" "$query" ""
}

cmd_current() {
  local user_id salt
  user_id="$(get_user_id)"
  salt="$(get_current_salt)"
  echo "Salt: ${salt}  User: ${user_id:0:8}..."
  run_roller "$user_id" "current" "" "$salt"
}

cmd_patch() {
  local new_salt="$1"
  if [[ ${#new_salt} -ne $SALT_LEN ]]; then
    echo "error: salt must be exactly ${SALT_LEN} characters (got ${#new_salt})" >&2; exit 1
  fi
  [[ -f "$CLAUDE_VERSIONED" ]] || { echo "error: binary not found at ${CLAUDE_VERSIONED}" >&2; exit 1; }

  echo "Quit Claude Code completely before patching, or it may restore the old companion cache."

  # Backup on first patch
  if [[ ! -f "$CLAUDE_BACKUP" ]]; then
    echo "Backing up original → ${CLAUDE_BACKUP}"
    cp "$CLAUDE_VERSIONED" "$CLAUDE_BACKUP"
  fi

  cp "$CLAUDE_BACKUP" "$CLAUDE_VERSIONED"
  chmod +x "$CLAUDE_VERSIONED"
  perl -pi -e "s/\Q${ORIGINAL_SALT}\E/${new_salt}/g" "$CLAUDE_VERSIONED"

  if grep -q "$ORIGINAL_SALT" "$CLAUDE_VERSIONED" 2>/dev/null; then
    echo "error: patch failed, restoring backup" >&2
    cp "$CLAUDE_BACKUP" "$CLAUDE_VERSIONED"; exit 1
  fi

  if command -v codesign &>/dev/null; then
    codesign --remove-signature "$CLAUDE_VERSIONED"
    codesign -s - "$CLAUDE_VERSIONED"
  fi

  echo -n "$new_salt" > "${CLAUDE_VERSIONED}.salt"
  clear_companion_cache

  echo "Patched! Restart Claude Code."
  run_roller "$(get_user_id)" "current" "" "$new_salt"
}

cmd_restore() {
  [[ -f "$CLAUDE_BACKUP" ]] || { echo "No backup — binary is original."; exit 0; }
  cp "$CLAUDE_BACKUP" "$CLAUDE_VERSIONED"
  chmod +x "$CLAUDE_VERSIONED"
  if command -v codesign &>/dev/null; then
    codesign --remove-signature "$CLAUDE_VERSIONED"
    codesign -s - "$CLAUDE_VERSIONED"
  fi
  rm -f "${CLAUDE_VERSIONED}.salt"
  echo "Quit Claude Code completely before restoring, or it may write stale companion data back to config."
  clear_companion_cache
  echo "Restored. Restart Claude Code."
}

case "${1:-help}" in
  search)  cmd_search "${*:2}" ;;
  patch)   [[ -n "${2:-}" ]] || { echo "Usage: $0 patch <salt>" >&2; exit 1; }; cmd_patch "$2" ;;
  current) cmd_current ;;
  restore) cmd_restore ;;
  *)
    cat <<EOF
Claude Code Buddy Reroller
Usage:
  $0 search "legendary shiny duck propeller"
  $0 search "epic cat wizard"
  $0 search "shiny"
  $0 patch <SALT>
  $0 current
  $0 restore
Searches until 25 matches are found (up to 100M rolls).
Requires: bun, jq, perl, codesign (macOS)
EOF
    ;;
esac
