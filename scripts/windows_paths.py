from __future__ import annotations

import os
from pathlib import Path


def io_path(path: Path) -> Path:
    """Use Windows' extended namespace for absolute filesystem I/O paths."""
    if os.name != "nt" or not path.is_absolute():
        return path
    value = str(path)
    if value.startswith(("\\\\?\\", "\\\\.\\")):
        return path
    if value.startswith("\\\\"):
        return Path("\\\\?\\UNC\\" + value[2:])
    return Path("\\\\?\\" + value)
