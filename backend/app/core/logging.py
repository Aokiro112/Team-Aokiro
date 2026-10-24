"""Structured logging module for NEXUS AI backend.
"""
import logging
import sys
from typing import Any, Dict


class NexusFormatter(logging.Formatter):
    """Custom formatter with contextual support."""

    grey = "\x1b[38;20m"
    yellow = "\x1b[33;20m"
    red = "\x1b[31;20m"
    bold_red = "\x1b[31;1m"
    cyan = "\x1b[36;20m"
    reset = "\x1b[0m"
    format_str = "%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s"

    FORMATS = {
        logging.DEBUG: grey + format_str + reset,
        logging.INFO: cyan + format_str + reset,
        logging.WARNING: yellow + format_str + reset,
        logging.ERROR: red + format_str + reset,
        logging.CRITICAL: bold_red + format_str + reset,
    }

    def format(self, record: logging.LogRecord) -> str:
        log_fmt = self.FORMATS.get(record.levelno, self.format_str)
        formatter = logging.Formatter(log_fmt, datefmt="%Y-%m-%d %H:%M:%S")
        return formatter.format(record)


def setup_logger(name: str = "nexus", level: int = logging.INFO) -> logging.Logger:
    """Configure and return an application logger."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(level)
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(level)
        ch.setFormatter(NexusFormatter())
        logger.addHandler(ch)
        logger.propagate = False
    return logger


logger = setup_logger()
