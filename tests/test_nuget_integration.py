"""The NuGet adapter participates in the existing immutable MCP receipt lifecycle."""
import copy
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import mcp_packages as mcp
from harness import safe_file


class NuGetIntegrationTests(unittest.TestCase):
    def test_install_replay_and_tamper_detection_use_managed_state(self):
        declaration = {'name': 'nuget', 'kind': 'nuget', 'package': 'NuGet.Mcp.Server',
                       'version': '1.4.23', 'entrypoint': 'nuget-mcp-server',
                       'args': [], 'env_vars': []}
        recipe = {'version': '1.4.23', 'target': {'platform': 'win32', 'arch': 'x64'}}
        with TemporaryDirectory(prefix='nuget integration 한글 ') as directory:
            state = Path(directory)
            def install(_recipe, root, _state, guard):
                guard(root / 'dotnet.exe', _state)
                (root / 'dotnet.exe').write_bytes(b'locked SDK host')
            with patch.object(mcp.nuget_packages, 'resolve', return_value=copy.deepcopy(recipe)), \
                    patch.object(mcp.nuget_packages, 'validate'), \
                    patch.object(mcp.nuget_packages, 'preflight'), \
                    patch.object(mcp.nuget_packages, 'launch', side_effect=lambda recipe, root: root / 'dotnet.exe'), \
                    patch.object(mcp.nuget_packages, 'install', side_effect=install) as installer:
                record = mcp.resolve(declaration)
                self.assertTrue(mcp.missing(record, state, guard=safe_file))
                mcp.install(record, state, guard=safe_file)
                self.assertEqual(mcp.missing(record, state, guard=safe_file), [])
                mcp.install(record, state, guard=safe_file)
                self.assertEqual(installer.call_count, 1)
                host = mcp._launch(record, mcp._root(record, state))
                host.write_bytes(b'tampered')
                self.assertIn('missing or changed', mcp.missing(record, state, guard=safe_file)[0])
                mcp.install(record, state, guard=safe_file)
                self.assertEqual(installer.call_count, 2)
                self.assertEqual(mcp.missing(record, state, guard=safe_file), [])


if __name__ == '__main__':
    unittest.main()
