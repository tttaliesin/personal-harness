---
name: create-readme
description: Write or revise a repository's README.md as its project landing page. Use for project README creation, rewrites, and layout improvements.
---

# Create a project README

Review the repository and relevant workspace documents to establish the audience, the project's purpose, and what works today. For a new project landing page, use the repository root unless the user or repository specifies another location.

- Lead with the project name and a concrete description. For a tool or pipeline, identify what it accepts, does, and produces. Put the most useful existing documentation, demo, or quickstart link near the top.
- Match the content to the project stage. For runnable software, show the shortest supported setup and usage example. During design, mark planned behavior and link to the plan. Keep detailed decisions and progress checklists in linked docs. Use badges and claims backed by the repository.
- Use GitHub Flavored Markdown and an existing project logo or icon when available. Use a focused example, screenshot, or compact diagram when it makes behavior easier to understand. Use emojis and callouts sparingly. Link to dedicated license, contributing, and changelog files when relevant.
- Check that local links resolve and that commands, examples, and visuals match the repository. Inspect the rendered first screen when a preview is available and report whether rendering was checked.

## Reference READMEs

When creating or changing the layout, read relevant examples. Adapt their information order and presentation to the target project's role and maturity.

- A short description and direct navigation links. [Rclone](https://github.com/rclone/rclone#readme)
- A specific explanation of collection, processing, and output, followed by usage and docs. [Telegraf](https://github.com/influxdata/telegraf#readme)
- A concrete input-to-output example and an architecture diagram, respectively. [Redpanda Connect](https://github.com/redpanda-data/connect#readme) · [Prometheus](https://github.com/prometheus/prometheus#readme)
- Quickstarts for runnable sample projects. [Serverless Chat](https://github.com/Azure-Samples/serverless-chat-langchainjs#readme) · [Serverless Recipes](https://github.com/Azure-Samples/serverless-recipes-javascript#readme)
- Short descriptions and immediately useful CLI examples. [run-on-output](https://github.com/sinedied/run-on-output#readme) · [Smoke](https://github.com/sinedied/smoke#readme)
