"""Discover workspace integration tests and the harness installer suite."""

from pathlib import Path


def load_tests(loader, tests, pattern):
    directory = Path(__file__).resolve().parent
    harness_tests = directory.parent / "packages/harness/tests"
    tests.addTests(loader.discover(str(directory), pattern=pattern))
    tests.addTests(loader.discover(str(harness_tests), pattern=pattern, top_level_dir=str(harness_tests)))
    return tests
