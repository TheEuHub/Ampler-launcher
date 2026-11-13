#!/usr/bin/env python3
"""Recover documented upstream clients from pinned GitHub blobs into app/mc/ (requires gh)."""
import argparse
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = REPO / 'app'
MANIFEST = Path(__file__).resolve().parent / 'upstream-files.json'


def blob_hash(path):
    size = path.stat().st_size
    digest = hashlib.sha1(f'blob {size}\0'.encode())
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def download(entry):
    target = APP / entry['target']
    if target.is_file() and target.stat().st_size == entry['size'] and blob_hash(target) == entry['sha']:
        return entry['target'] + ' (already verified)'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + '.partial')
    try:
        with temporary.open('wb') as output:
            result = subprocess.run(['gh', 'api', '-H', 'Accept: application/vnd.github.raw+json',
                                     f"repos/{entry['repo']}/git/blobs/{entry['sha']}"],
                                    stdout=output, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace').strip())
        if temporary.stat().st_size != entry['size'] or blob_hash(temporary) != entry['sha']:
            raise ValueError('download does not match the Git blob hash')
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return entry['target']


def enable_complete_catalogs(entries):
    # Enable only a complete upstream directory, never a partially downloaded build.
    by_directory = {}
    for entry in entries:
        parts = Path(entry['target']).parts
        folder = '/'.join(parts[:3] if parts[1] == 'ir' else parts[:2])
        by_directory.setdefault(folder, []).append(entry)
    complete = {folder for folder, files in by_directory.items()
                if all((APP / item['target']).is_file()
                       and (APP / item['target']).stat().st_size == item['size']
                       and blob_hash(APP / item['target']) == item['sha'] for item in files)}
    availability = APP / 'mc' / 'upstream-availability.json'
    availability.parent.mkdir(parents=True, exist_ok=True)
    availability.write_text(json.dumps(sorted(complete), indent=2) + '\n')



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workers', type=int, default=4, choices=range(1, 9))
    args = parser.parse_args()
    entries = json.loads(MANIFEST.read_text())
    errors = []
    print(f'Recovering {len(entries)} files ({sum(x["size"] for x in entries) / 1e9:.2f} GB).', flush=True)
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            future_map = {pool.submit(download, entry): entry for entry in entries}
            for future in concurrent.futures.as_completed(future_map):
                try:
                    print('OK', future.result(), flush=True)
                except Exception as exc:
                    name = future_map[future]['target']
                    errors.append(name)
                    print(f'FAILED {name}: {exc}', file=sys.stderr, flush=True)
    finally:
        enable_complete_catalogs(entries)
    if errors:
        raise SystemExit(f'{len(errors)} files failed. Rerun this command to resume.')

if __name__ == '__main__':
    main()
