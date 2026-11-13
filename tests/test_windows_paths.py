import os
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from windows_paths import io_path


class WindowsPathsTests(unittest.TestCase):
    def test_relative_paths_are_unchanged(self):
        for path in (Path("relative/file"), Path(".")):
            self.assertEqual(io_path(path), path)

    @unittest.skipUnless(os.name == "nt", "Windows path namespace")
    def test_drive_unc_and_existing_namespaces(self):
        cases = [(r"C:\state [client] & 한글\file", r"\\?\C:\state [client] & 한글\file"),
                 (r"\\server\share\state\file", r"\\?\UNC\server\share\state\file"),
                 (r"\\?\C:\state\file", r"\\?\C:\state\file"),
                 (r"\\?\UNC\server\share\file", r"\\?\UNC\server\share\file"),
                 (r"\\.\pipe\fixture", r"\\.\pipe\fixture"),
                 (r"C:relative\file", r"C:relative\file"),
                 (r"\rooted\file", r"\rooted\file")]
        with patch.object(Path, "resolve", side_effect=AssertionError("converter resolved a link")), \
                patch.object(Path, "stat", side_effect=AssertionError("converter accessed filesystem")):
            for source, expected in cases:
                with self.subTest(source=source):
                    self.assertEqual(io_path(Path(source)), Path(expected))
                    self.assertEqual(io_path(io_path(Path(source))), Path(expected))

    @unittest.skipIf(os.name == "nt", "Non-Windows paths")
    def test_non_windows_paths_are_unchanged(self):
        for path in (Path("/state/file"), Path(r"C:\state\file"), Path(r"\\server\share\file")):
            self.assertEqual(io_path(path), path)

    @unittest.skipUnless(os.name == "nt", "Windows long-path I/O")
    def test_real_long_file_round_trip(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / ("state [client] & 한글 " + "x" * 90) / ("y" * 90) / ("z" * 50 + ".txt")
            self.assertGreater(len(str(path)), 260)
            io_path(path.parent).mkdir(parents=True)
            try:
                io_path(path).write_bytes(b"long-path payload")
                self.assertEqual(io_path(path).read_bytes(), b"long-path payload")
                self.assertTrue(io_path(path).is_file())
            finally:
                shutil.rmtree(io_path(root))


if __name__ == "__main__":
    unittest.main()
