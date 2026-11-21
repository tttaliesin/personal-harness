# External-service simulators

Build a simulator only for a relevant external boundary that cannot reasonably be exercised directly or needs deterministic failures.
Define the boundary, protocol, and behavior required by actual consumers.
Cover relevant normal responses and deterministic failure cases such as timeout, disconnect, invalid payload, or unavailable dependency.
Use fixed seeds, controllable state, and an explicit reset when the scenario needs them.
Reuse an existing stub or simulator when it can represent that contract.
Do not reimplement the system under test behind a fake endpoint.

Track reusable simulator code and scenario inputs as source.
Keep execution logs, recordings, temporary databases, and generated reports in ignored output paths.
State which behavior the simulator represents and which production interactions remain unverified.
