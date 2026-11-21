# Compose dependencies

Use Compose for compatible shared local dependencies when that fits the repository.
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

## Official references

- [Compose startup order and readiness](https://docs.docker.com/compose/how-tos/startup-order/)
- [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/)
- [Compose multiple-file merge and paths](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)
