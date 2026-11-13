from pathlib import Path


def resolve(spec: dict) -> dict:
    raise NotImplementedError


def install(record: dict, state: Path, *, guard) -> None:
    raise NotImplementedError


def configuration(record: dict, state: Path, *, node: str = "node") -> dict:
    raise NotImplementedError


def missing(record: dict, state: Path, *, guard) -> list[str]:
    raise NotImplementedError
