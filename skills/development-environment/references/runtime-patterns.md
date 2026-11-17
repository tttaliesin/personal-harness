# Select runtime patterns for the scenario

## Compose dependencies

Keep the application framework and existing container/native split.
Use the repository's pinned images and configuration conventions.
Use optional profiles or existing overlays for additional dependencies rather than starting every service for every test.
Check the installed Compose version before relying on version-specific options.

A running container is not necessarily ready.
Use meaningful health checks and dependency conditions where supported, or the repository's readiness probe before testing.
Treat one-shot migrations or seed jobs separately from continuously running services.
Keep test seed data deterministic and separate from production data.

Use per-run names, networks, ports, and state where concurrent execution needs isolation.
Document whether data is persistent or disposable.
Destructive reset commands must target only this task's disposable resources.

Official references:
- [Compose startup order and readiness](https://docs.docker.com/compose/how-tos/startup-order/)
- [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/)
- [Compose multiple-file merge and paths](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)

## Native C# and Windows services

Read `global.json`, project TFM declarations, configuration, and existing launch/test scripts before choosing commands.
Distinguish modern .NET from .NET Framework and use compatible tooling.
Compatible databases and queues may run in containers while the application runs natively.
An in-process host test can validate application behavior within its host boundary.
Windows service installation, identity, permissions, start/stop, and Service Control Manager behavior require a relevant Windows execution test.
Do not claim those behaviors are verified by an HTTP mock or a Linux container.

Official references:
- [ASP.NET Core integration testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)
- [Windows service programs](https://learn.microsoft.com/en-us/windows/win32/services/service-programs)
- [Testcontainers for .NET](https://dotnet.testcontainers.org/)

## External-service simulators

Define the boundary, protocol, and behavior required by actual consumers.
Cover relevant normal responses and deterministic failure cases such as timeout, disconnect, invalid payload, or unavailable dependency.
Use fixed seeds, controllable state, and an explicit reset when the scenario needs them.
Reuse an existing stub or simulator when it can represent that contract.
Do not reimplement the system under test behind a fake endpoint.

Track reusable simulator code and scenario inputs as source.
Keep execution logs, recordings, temporary databases, and generated reports in ignored output paths.
State which behavior the simulator represents and which production interactions remain unverified.
