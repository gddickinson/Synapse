"""StrictVersion replacement: distutils (and distutils.version.StrictVersion) was removed in Python 3.12.

Only used to compare flika version strings such as '0.2.23'; compares the numeric parts as a tuple.
"""
import re


def StrictVersion(v):  # noqa: N802 (keeps the old name so call sites are unchanged)
    """Tuple of the version's integer parts, padded to three: StrictVersion('0.2.9') < StrictVersion('0.2.23')."""
    nums = [int(x) for x in re.findall(r"\d+", str(v))[:3]]
    return tuple(nums + [0] * (3 - len(nums)))
