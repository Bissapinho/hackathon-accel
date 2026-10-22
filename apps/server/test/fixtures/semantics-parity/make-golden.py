"""Records EvoOntology's own answers on the parity bank, for apps/server/test/semantics.parity.test.ts.

Run from this folder with the Python EvoOntology core importable
(https://github.com/ruc-datalab/EvoOntology, e.g. `pip install -e <EvoOntology checkout>`):

    python3 make-golden.py

Writes golden.json. Re-run only when cases.json or the bank changes.
"""

import copy
import json
import tempfile
from pathlib import Path

from evoontology import SemanticLayer, SemanticStore, ensure_workspace
from evoontology.trajectory.trajectory import truncate_result
from evoontology.validate import validate

HERE = Path(__file__).resolve().parent
BANK = HERE / "bank"
FAMILIES = ("terms", "mappings", "relations", "constraints", "evidence")


def load_records():
    return {f: json.loads((BANK / "versions" / "v0" / f"{f}.json").read_text()) for f in FAMILIES}


def mutations():
    """Broken copies of the bank, each with one kind of unresolved reference."""
    def mutate(fn):
        records = copy.deepcopy(load_records())
        fn(records)
        return records

    def by_id(records, family, rid):
        return next(r for r in records[family] if r["id"] == rid)

    return {
        "valid": load_records(),
        "mapping_term": mutate(lambda r: by_id(r, "mappings", "M_order").update(term_id="T_missing")),
        "relation_ends": mutate(lambda r: by_id(r, "relations", "R_order_store").update(source="T_nope", target="T_missing")),
        "constraint_target": mutate(lambda r: by_id(r, "constraints", "C_rma_negative").update(target="X_missing")),
        "term_evidence": mutate(lambda r: by_id(r, "terms", "T_order").update(evidence=["E_prefixes", "E_missing"])),
        "mapping_evidence": mutate(lambda r: by_id(r, "mappings", "M_return").update(evidence=["E_gone"])),
        "removed_evidence": mutate(lambda r: r.update(evidence=[e for e in r["evidence"] if e["id"] != "E_negative"])),
    }


def main():
    cases = json.loads((HERE / "cases.json").read_text())
    layer = SemanticLayer.load(str(BANK))
    golden = {
        "browse": [layer.browse(**c) for c in cases["browse"]],
        "resolve": [layer.resolve(**c) for c in cases["resolve"]],
        "truncate": [truncate_result(t) for t in cases["truncate"]],
        "validate": {},
    }
    for name, records in mutations().items():
        with tempfile.TemporaryDirectory() as tmp:
            ensure_workspace(tmp)
            SemanticStore.save_version(tmp, "v0", records)
            golden["validate"][name] = {"records": records, "errors": validate(tmp, version="v0")["errors"]}
    (HERE / "golden.json").write_text(json.dumps(golden, ensure_ascii=False, indent=2) + "\n")
    print("golden.json written")


if __name__ == "__main__":
    main()
