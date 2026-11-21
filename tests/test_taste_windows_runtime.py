"""Runtime boundaries using Node and temporary fixtures, without launching browsers."""

import json
import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "skills/adapters/taste-windows-runtime/scripts"
NODE = shutil.which("node")


@unittest.skipUnless(NODE, "Node is not installed")
class TasteWindowsRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory()))
        self.env = dict(os.environ)
        for key in ("NODE_OPTIONS", "CHROME_PATH", "PERSONAL_HARNESS_TASTE_RUNTIME"):
            self.env.pop(key, None)
        for key in ("HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP"):
            self.env[key] = str(self.root)

    def node(self, args, *, env=None):
        return subprocess.run(
            [NODE, *map(str, args)], cwd=self.root,
            env=self.env if env is None else env,
            capture_output=True, text=True, encoding="utf-8", timeout=20,
        )

    def javascript(self, body):
        script = self.root / "boundary.mjs"
        script.write_text(
            "import assert from 'node:assert/strict';\n"
            "import path from 'node:path';\n"
            f"import {{ browserPath, edgeArguments, childEnvironment }} from {json.dumps((SCRIPTS / 'runtime.mjs').as_uri())};\n"
            + body, encoding="utf-8",
        )
        result = self.node([script])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_browser_selection_respects_explicit_path_and_non_windows(self):
        self.javascript(r"""
const root = path.resolve('Program Files 한글');
const edge = path.join(root, 'Microsoft/Edge/Application/msedge.exe');
const probes = [];
assert.equal(browserPath({ProgramFiles: root}, 'win32', candidate => {
  probes.push(candidate);
  return candidate === edge;
}), edge);
assert.ok(probes.some(candidate => candidate.endsWith('chrome.exe')));
const explicit = path.resolve('custom browser 한글.exe');
assert.equal(browserPath({CHROME_PATH: explicit}, 'win32', candidate => {
  assert.equal(candidate, explicit);
  return true;
}), explicit);
assert.throws(() => browserPath({CHROME_PATH: explicit}, 'win32', () => false), /CHROME_PATH/);
assert.equal(browserPath({CHROME_PATH: explicit}, 'linux', () => {
  assert.fail('Non-Windows must not probe browser files');
}), null);
""")

    def test_only_selected_headless_edge_gets_one_compatibility_flag(self):
        self.javascript(r"""
const edge = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
const flag = '--edge-skip-compat-layer-relaunch';
for (const headless of ['--headless', '--headless=new']) {
  const args = [headless, '--screenshot=결과 image.png'];
  const changed = edgeArguments(edge.toUpperCase(), args, edge, 'win32');
  assert.deepEqual(changed, [...args, flag]);
  assert.deepEqual(args, [headless, '--screenshot=결과 image.png']);
  assert.strictEqual(edgeArguments(edge, changed, edge, 'win32'), changed);
}
for (const [command, args, browser, platform] of [
  [edge, ['--headless'], edge, 'linux'],
  [edge, ['--headless'], 'C:\\other\\msedge.exe', 'win32'],
  [edge, ['--headless-shell'], edge, 'win32'],
  [edge, ['--screenshot=image.png'], edge, 'win32'],
  ['C:\\Chrome\\chrome.exe', ['--headless'], 'C:\\Chrome\\chrome.exe', 'win32'],
  ['node.exe', ['--headless', 'fixture.mjs'], edge, 'win32'],
]) assert.strictEqual(edgeArguments(command, args, browser, platform), args);
""")

    def test_runner_cancellation_preserves_child_cleanup_and_exit_code(self):
        browser = self.root / "fake browser.exe"
        browser.write_bytes(b"not an executable")
        ready = self.root / "ready marker"
        cleanup = self.root / "cleanup marker"
        fixture = self.root / "signal fixture.mjs"
        fixture.write_text(
            "import fs from 'node:fs';\n"
            "const [ready, cleanup] = process.argv.slice(2);\n"
            "process.on('SIGTERM', () => {\n"
            "  fs.writeFileSync(cleanup, 'SIGTERM cleanup');\n"
            "  process.exit(29);\n"
            "});\n"
            "setInterval(() => {}, 100);\n"
            "setTimeout(() => process.exit(98), 8000);\n"
            "fs.writeFileSync(ready, 'ready');\n", encoding="utf-8",
        )
        driver = self.root / "signal driver.mjs"
        driver.write_text(
            "import fs from 'node:fs';\n"
            "import { setTimeout as delay } from 'node:timers/promises';\n"
            f"process.argv = {json.dumps([NODE, str(SCRIPTS / 'run.mjs'), str(fixture), str(ready), str(cleanup)])};\n"
            f"await import({json.dumps((SCRIPTS / 'run.mjs').as_uri())});\n"
            "const deadline = Date.now() + 5000;\n"
            f"while (!fs.existsSync({json.dumps(str(ready))})) {{\n"
            "  if (Date.now() > deadline) throw new Error('Fixture never became ready');\n"
            "  await delay(10);\n"
            "}\n"
            "process.emit('SIGTERM');\n", encoding="utf-8",
        )
        result = self.node([driver], env={**self.env, "CHROME_PATH": str(browser)})
        self.assertEqual(result.returncode, 29, result.stdout + result.stderr)
        self.assertEqual(cleanup.read_text(encoding="utf-8"), "SIGTERM cleanup")

    def test_runner_preserves_unicode_arguments_options_and_exit_code(self):
        # An inert file satisfies explicit browser validation; it is never executed.
        browser = self.root / "가짜 Edge browser.exe"
        browser.write_bytes(b"not an executable")
        script = self.root / "원본 fixture with spaces.mjs"
        script.write_text(
            "console.log(JSON.stringify({args: process.argv.slice(2), "
            "options: process.env.NODE_OPTIONS, browser: process.env.CHROME_PATH}));\n"
            "process.exitCode = 42;\n", encoding="utf-8",
        )
        options = "--no-warnings --stack-trace-limit=37"
        env = {**self.env, "CHROME_PATH": str(browser), "NODE_OPTIONS": options}
        args = ["한글 argument with spaces", "", 'literal "quotes"', "끝 경로/파일"]
        result = self.node([SCRIPTS / "run.mjs", script, *args], env=env)
        self.assertEqual(result.returncode, 42, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["args"], args)
        self.assertEqual(payload["browser"], str(browser))
        preload = f"--import={(SCRIPTS / 'preload.mjs').as_uri()}"
        expected_options = f"{options} {preload}" if os.name == "nt" else options
        self.assertEqual(payload["options"], expected_options)
        self.javascript(r"""
const env = {NODE_OPTIONS: '--no-warnings', KEEP: '공백 value'};
const browser = 'C:/fake/msedge.exe';
const preload = 'file:///temporary/preload.mjs';
const child = childEnvironment(env, browser, preload);
assert.equal(child.NODE_OPTIONS, '--no-warnings --import=' + preload);
assert.equal(child.KEEP, env.KEEP);
assert.equal(child.CHROME_PATH, browser);
assert.equal(child.PERSONAL_HARNESS_TASTE_RUNTIME, '1');
assert.deepEqual(childEnvironment(child, browser, preload), child);
assert.deepEqual(childEnvironment(env, null, preload), env);
assert.deepEqual(env, {NODE_OPTIONS: '--no-warnings', KEEP: '공백 value'});
""")


if __name__ == "__main__":
    unittest.main()
