# Native C# and Windows service checks

Read `global.json`, project TFM declarations, configuration, and existing launch/test scripts before choosing commands.
Distinguish modern .NET from .NET Framework and use compatible tooling.
Keep native Windows services or .NET Framework components on a compatible Windows host when their behavior requires it.
Compatible databases and queues may run in containers while the application runs natively.
An in-process host test can validate application behavior within its host boundary.
Windows service installation, identity, permissions, start/stop, and Service Control Manager behavior require a relevant Windows execution test.
Do not claim those behaviors are verified by an HTTP mock or a Linux container.

## Official references

- [ASP.NET Core integration testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)
- [Windows service programs](https://learn.microsoft.com/en-us/windows/win32/services/service-programs)
- [Testcontainers for .NET](https://dotnet.testcontainers.org/)
