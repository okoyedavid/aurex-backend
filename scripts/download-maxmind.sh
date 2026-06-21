#!/usr/bin/env bash
set -euo pipefail

if [ -z "${MAXMIND_ACCOUNT_ID:-}" ] || [ -z "${MAXMIND_LICENSE_KEY:-}" ]; then
  echo "MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY are required"
  exit 1
fi

db_path="${MAXMIND_DB_PATH:-src/data/GeoLite2-City.mmdb}"
db_dir="$(dirname "$db_path")"
archive_path="/tmp/GeoLite2-City.tar.gz"
extract_dir="/tmp/maxmind-geolite2-city"

mkdir -p "$db_dir" "$extract_dir"

curl -L \
  -u "$MAXMIND_ACCOUNT_ID:$MAXMIND_LICENSE_KEY" \
  "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" \
  -o "$archive_path"

tar -xzf "$archive_path" -C "$extract_dir"

mmdb_file="$(find "$extract_dir" -name "GeoLite2-City.mmdb" -print -quit)"

if [ -z "$mmdb_file" ]; then
  echo "GeoLite2-City.mmdb was not found in the downloaded archive"
  exit 1
fi

cp "$mmdb_file" "$db_path"
echo "Downloaded MaxMind database to $db_path"
