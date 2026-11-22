"""Exercise upstream source resolution with synthetic GitHub archives."""

from io import BytesIO
import tarfile
import unittest
from unittest.mock import Mock, call

from packages.harness.installer.upstream_skill_sources import fetch_skill


REPOSITORY = "owner/project"
SOURCE = f"https://github.com/{REPOSITORY}.git"
ARCHIVE_URL = f"https://codeload.github.com/{REPOSITORY}/tar.gz"
ARCHIVE_ROOT = "project-fixture"
FIRST_COMMIT = "a" * 40
SECOND_COMMIT = "b" * 40
SKILL_BYTES = b"# Fixture skill\r\n"


def packed_files(files, *, extra_members=()):
    with BytesIO() as buffer:
        with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
            for path, data in files.items():
                member = tarfile.TarInfo(f"{ARCHIVE_ROOT}/{path}")
                member.size = len(data)
                archive.addfile(member, BytesIO(data))
            for member in extra_members:
                archive.addfile(member)
        return buffer.getvalue()


class UpstreamSkillSourceTests(unittest.TestCase):
    def upstream(self, **changes):
        return {"name": "example", "role": "upstream", "source": SOURCE, "channel": "default-branch",
                "files": {".": "skill"}, **changes}

    def fetch_from_archive(self, files, *, extra_members=(), **changes):
        archive = packed_files(files, extra_members=extra_members)
        return fetch_skill(
            self.upstream(**changes), fetch=Mock(return_value=archive),
            github=Mock(return_value={"sha": FIRST_COMMIT}), release=Mock(),
        )

    def test_default_branch_resolves_a_fresh_commit_and_preserves_nested_bytes(self):
        nested = "references/nested/example.bin"
        first_bytes = b"\x00\xff\r\n"
        second_bytes = b"\xff\x00\n"
        archives = {
            f"{ARCHIVE_URL}/{FIRST_COMMIT}": packed_files({
                "skill/SKILL.md": SKILL_BYTES, f"skill/{nested}": first_bytes, "README.md": b"outside the skill",
            }),
            f"{ARCHIVE_URL}/{SECOND_COMMIT}": packed_files({
                "skill/SKILL.md": SKILL_BYTES, f"skill/{nested}": second_bytes,
            }),
        }
        fetch = Mock(side_effect=archives.__getitem__)
        github = Mock(side_effect=[{"sha": FIRST_COMMIT}, {"sha": SECOND_COMMIT}])
        release = Mock()
        spec = self.upstream()
        for commit, data in ((FIRST_COMMIT, first_bytes), (SECOND_COMMIT, second_bytes)):
            with self.subTest(commit=commit):
                actual = fetch_skill(spec, fetch=fetch, github=github, release=release)
                self.assertEqual(actual, (commit, {"SKILL.md": SKILL_BYTES, nested: data}))
        self.assertEqual(github.call_args_list, [call(REPOSITORY, "commits/HEAD")] * 2)
        self.assertEqual(fetch.call_args_list, [call(url) for url in archives])
        release.assert_not_called()

    def test_latest_release_maps_adapter_license_and_reference_directory(self):
        spec = self.upstream(role="adapter", path="skills/adapters/example", adapts=REPOSITORY,
                             channel="latest-release", files={"LICENSE": "legal/NOTICE", "references": "docs"})
        fetch = Mock(return_value=packed_files({
            "legal/NOTICE": b"license fixture\n",
            "docs/nested/spec.txt": b"reference fixture\r\n",
            "SKILL.md": b"outside the adapter selections",
        }))
        github = Mock()
        release = Mock(return_value=({"tag_name": "v1.2.3"}, FIRST_COMMIT))
        self.assertEqual(fetch_skill(spec, fetch=fetch, github=github, release=release), (FIRST_COMMIT, {
            "LICENSE": b"license fixture\n", "references/nested/spec.txt": b"reference fixture\r\n",
        }))
        release.assert_called_once_with(REPOSITORY)
        fetch.assert_called_once_with(f"{ARCHIVE_URL}/{FIRST_COMMIT}")
        github.assert_not_called()

    def test_unresolved_branch_head_is_rejected_before_archive_download(self):
        fetch = Mock()
        with self.assertRaisesRegex(ValueError, "exact Git commit SHA"):
            fetch_skill(self.upstream(), fetch=fetch, github=Mock(return_value={"sha": "main"}), release=Mock())
        fetch.assert_not_called()

    def test_selected_links_and_special_files_are_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.FIFOTYPE):
            member = tarfile.TarInfo(f"{ARCHIVE_ROOT}/skill/references/not-a-file")
            member.type = kind
            if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                member.linkname = f"{ARCHIVE_ROOT}/skill/SKILL.md"
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, "Unsupported archive entry"):
                self.fetch_from_archive({"skill/SKILL.md": SKILL_BYTES}, extra_members=[member])

    def test_traversal_and_windows_unsafe_paths_in_selected_members_are_rejected(self):
        for name in ("../outside.txt", "references/CON.txt", "references/file.txt:stream"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Invalid skill file path"):
                self.fetch_from_archive({"skill/SKILL.md": SKILL_BYTES, f"skill/{name}": b"fixture"})

    def test_conflicting_archive_paths_are_rejected(self):
        duplicate = tarfile.TarInfo(f"{ARCHIVE_ROOT}/skill/SKILL.md")
        with self.assertRaisesRegex(ValueError, "Duplicate archive entry"):
            self.fetch_from_archive({"skill/SKILL.md": SKILL_BYTES}, extra_members=[duplicate])
        with self.assertRaisesRegex(ValueError, "Conflicting skill output paths"):
            self.fetch_from_archive({
                "skill/SKILL.md": SKILL_BYTES,
                "skill/references/Guide.txt": b"first",
                "skill/references/guide.txt": b"second",
            })

    def test_upstream_skill_requires_its_root_skill_file(self):
        with self.assertRaisesRegex(ValueError, "SKILL.md at the skill root"):
            self.fetch_from_archive({"skill/references/nested/SKILL.md": SKILL_BYTES})


if __name__ == "__main__":
    unittest.main()
