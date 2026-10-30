"""One source for the supplied translation table, shared by L1 and L2."""
import json
from pathlib import Path

REFERENCE_GLOSSARY = json.loads((Path(__file__).with_name("data") / "legal_glossary.json").read_text(encoding="utf-8"))
