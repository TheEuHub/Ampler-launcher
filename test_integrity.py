import json
import re
import shutil
import tempfile
import zipfile
import zlib
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / 'app'
MC = APP / 'mc'

class IntegrityTests(unittest.TestCase):
    def test_shell_local_resources_exist(self):
        html = (APP / 'index.html').read_text()
        for path in re.findall(r'(?:src|href)="\./(assets/[^"?]+)', html):
            self.assertTrue((APP / path).is_file(), path)

    def test_catalog_availability_and_icons(self):
        for name in ('base', 'modded', 'assisted', 'alpha', 'beta'):
            entries = json.loads((APP / 'assets/json' / (name + '.json')).read_text())
            for entry in entries:
                icon = APP / entry['icon'].removeprefix('./')
                self.assertTrue(icon.is_file() and icon.stat().st_size, str(icon))
                if not entry.get('disabled'):
                    path = unquote(urlsplit(entry['link']).path).removeprefix('./')
                    self.assertTrue((APP / path / 'index.html').is_file(), entry['link'])
                else:
                    self.assertFalse(entry['active'])
                    self.assertTrue(entry.get('note'))

    def test_downloads_include_all_client_editions(self):
        script = (APP / 'assets/js/index.js').read_text()
        for catalog in ('web', 'modded', 'assisted', 'alpha', 'beta'):
            self.assertIn('catalog: CATALOGS.' + catalog, script)

    def test_upstream_manifest_and_availability(self):
        manifest = json.loads((ROOT / 'tools/upstream-files.json').read_text())
        self.assertEqual(len(manifest), len({item['target'] for item in manifest}))
        for item in manifest:
            target = Path(item['target'])
            self.assertEqual(target.parts[0], 'mc')
            self.assertNotIn('..', target.parts)
            self.assertEqual(len(item['sha']), 40)
        availability = json.loads((MC / 'upstream-availability.json').read_text())
        for name in ('base', 'modded', 'assisted', 'alpha', 'beta'):
            entries = json.loads((APP / 'assets/json' / (name + '.json')).read_text())
            for entry in entries:
                if entry.get('disabled'):
                    folder = unquote(urlsplit(entry['link']).path).removeprefix('./').rstrip('/')
                    self.assertIn(folder, availability, entry['title'])
                    self.assertTrue((APP / folder / 'index.html').is_file(), folder)

    def test_recovery_matches_archive(self):
        import sys
        sys.path.insert(0, str(ROOT / 'tools'))
        from recover_clients import CLIENTS
        with tempfile.TemporaryFile() as joined:
            for number in range(1, 16):
                with (ROOT / 'archive' / f'all-{number}.zip').open('rb') as part:
                    shutil.copyfileobj(part, joined)
            joined.seek(0)
            with zipfile.ZipFile(joined) as bundle:
                expected = {f'bundle/Eaglercraft_IR_{name}.zip' for name in CLIENTS}
                self.assertEqual(expected, {i.filename for i in bundle.infolist() if not i.is_dir()})
                for name, folder in CLIENTS.items():
                    with bundle.open(f'bundle/Eaglercraft_IR_{name}.zip') as src, tempfile.TemporaryFile() as nested:
                        shutil.copyfileobj(src, nested)
                        nested.seek(0)
                        with zipfile.ZipFile(nested) as archive:
                            members = [i for i in archive.infolist() if not i.is_dir()]
                            for member in members:
                                filename = 'index.html' if member.filename.lower().endswith('.html') else Path(member.filename).name
                                self.assertIn(filename, ('index.html', 'READ_ME.txt'))
                                recovered = MC / 'ir' / folder / filename
                                crc = 0
                                with recovered.open('rb') as output:
                                    while chunk := output.read(1024 * 1024):
                                        crc = zlib.crc32(chunk, crc)
                                self.assertEqual(member.CRC, crc, str(recovered))
                                self.assertEqual(member.file_size, recovered.stat().st_size, str(recovered))

    def test_recovered_clients_match_manifest(self):
        import sys
        sys.path.insert(0, str(ROOT / 'tools'))
        from recover_clients import CLIENTS
        for folder in CLIENTS.values():
            self.assertTrue((MC / 'ir' / folder / 'index.html').is_file(), folder)

if __name__ == '__main__':
    unittest.main()
