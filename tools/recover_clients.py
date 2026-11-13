#!/usr/bin/env python3
"""Reassemble archive/all-*.zip and recover its single-file clients into app/mc/."""
import shutil
import tempfile
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = REPO / 'app'
CLIENTS = {
    '1.12.2': '1.12.2', '1.12.2wasm': '1.12.2-wasm',
    '1.8.8': '1.8.8', '1.8.8wasm': '1.8.8-wasm',
    '1.5.2': '1.5.2', '1.6.4': '1.6.4', '1.2.5': '1.2.5',
    'c0.30wasm': 'classic-0.3.0-wasm', 'alpha1.2.6': 'alpha-1.2.6',
    'beta1.7.3': 'beta-1.7.3', 'beta1.3': 'beta-1.3', 'beta1.1': 'beta-1.1',
    'ASTRACLIENT_1.6.0': 'astra-client', 'ASTRACLIENT_1.6.0wasm': 'astra-client-wasm',
    'resent': 'resent-client', 'StarLikeClient_0.4.2': 'starlike-client',
    'tf1.12.2wasm': 'tuff-client-1.12.2-wasm', 'winstonhorror': 'winston-horror',
    'z1.11': 'z1.11', 'p1.8.8': 'pixelclient-1.8.8',
    'p1.8.8wasm': 'pixelclient-1.8.8-wasm', 'p1.12.2': 'pixelclient-1.12.2',
    'p1.12.2wasm': 'pixelclient-1.12.2-wasm',
}

def main():
    parts = [REPO / 'archive' / f'all-{i}.zip' for i in range(1, 16)]
    missing = [str(p.name) for p in parts if not p.is_file()]
    if missing:
        raise SystemExit('Missing archive parts (expected in archive/): ' + ', '.join(missing))
    # Use a temporary file rather than keeping the 345 MB archive in memory.
    with tempfile.TemporaryFile() as joined:
        for part in parts:
            with part.open('rb') as source:
                shutil.copyfileobj(source, joined)
        joined.seek(0)
        with zipfile.ZipFile(joined) as bundle:
            archives = {item.filename for item in bundle.infolist() if not item.is_dir()}
            expected = {f'bundle/Eaglercraft_IR_{name}.zip' for name in CLIENTS}
            if archives != expected:
                raise ValueError(f'Bundle contents differ from manifest: missing={sorted(expected - archives)}, unexpected={sorted(archives - expected)}')
            for name, target in CLIENTS.items():
                archive = f'bundle/Eaglercraft_IR_{name}.zip'
                with bundle.open(archive) as source, tempfile.TemporaryFile() as nested:
                    shutil.copyfileobj(source, nested)
                    nested.seek(0)
                    with zipfile.ZipFile(nested) as client:
                        html = [n for n in client.namelist() if n.lower().endswith('.html') and not n.endswith('/')]
                        if len(html) != 1:
                            raise ValueError(f'{archive}: expected one HTML client, found {len(html)}')
                        # The bundle's other files are attribution/readme files. Keep
                        # them alongside the client instead of silently dropping them.
                        files = [item for item in client.infolist() if not item.is_dir()]
                        other = [item for item in files if item.filename != html[0]]
                        if any(Path(item.filename).name != 'READ_ME.txt' for item in other) or len(other) > 1:
                            raise ValueError(f'{archive}: unexpected companion files')
                        dest = APP / 'mc' / 'ir' / target / 'index.html'
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        for member, output in [(html[0], dest)] + [(item, dest.parent / 'READ_ME.txt') for item in other]:
                            with client.open(member) as src, output.open('wb') as out:
                                shutil.copyfileobj(src, out)
                print(f'{name} -> {dest.relative_to(REPO)}')

if __name__ == '__main__':
    main()
