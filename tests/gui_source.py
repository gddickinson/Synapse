"""Load single functions from the FLIKA plugin's source without importing the plugin.

The plugin modules import flika, PyQt and pyqtgraph at module level (and `distutils`, gone in Python 3.12), so the
tests pull one function or method out of the source with `ast` and execute it in a small namespace. This checks the
code the desktop plugin actually runs, not a copy of it.
"""
import ast
import importlib.util
from pathlib import Path

PLUGIN = Path(__file__).resolve().parent.parent / "synapse_plugin"


def function_source(file: str, name: str, cls: str | None = None) -> str:
    """Source of function `name` (a method of class `cls` if given) in synapse_plugin/<file>."""
    path = PLUGIN / file
    text = path.read_text()
    tree = ast.parse(text)
    scope = tree.body
    if cls is not None:
        scope = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == cls).body
    node = next(n for n in scope if isinstance(n, ast.FunctionDef) and n.name == name)
    return ast.get_source_segment(text, node).replace("\t", "    ")


def load_function(file: str, name: str, namespace: dict, cls: str | None = None):
    """Execute the function's source in `namespace` and return the function (methods take a `self` argument)."""
    import textwrap
    src = textwrap.dedent(function_source(file, name, cls))
    ns = dict(namespace)
    exec(compile(src, f"synapse_plugin/{file}:{name}", "exec"), ns)
    return ns[name]


def load_module(relpath: str, name: str):
    """Import one plugin file on its own (bypassing the package __init__, which imports Qt)."""
    spec = importlib.util.spec_from_file_location(name, PLUGIN / relpath)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
