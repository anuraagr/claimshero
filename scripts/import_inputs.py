"""Import the supplied synthetic portfolio without modifying any source file."""
import argparse
import csv
import hashlib
import json
import shutil
import sqlite3
from pathlib import Path


FILES = {
    "build_html.py": "3a84aaa8-39ec-4e9b-8b16-243d4a08c47c-build_html.py",
    "claims_baseline_vs_agent.csv": "9af96352-f0db-4cce-a7af-50c9f58ec6c1-claims_baseline_vs_agent.csv",
    "epic_optime_nurse_logs.csv": "fe52f7ce-5d29-40c1-8032-0b6786e89548-epic_optime_nurse_logs.csv",
    "epic_postop_nursing_labs.csv": "8fc7da65-5e7e-4f9e-952e-d0b359309242-epic_postop_nursing_labs.csv",
    "epic_surgeon_op_notes.csv": "39fb9fe8-dd7b-4517-9a9e-d2c515d414a5-epic_surgeon_op_notes.csv",
    "icd10_drg_reference.csv": "2dd739c1-e555-4139-adab-5ea9de56433b-icd10_drg_reference.csv",
    "neuro_rcm_epic.db": "cbe80c84-6a3a-4278-a162-c343a8e56fb3-neuro_rcm_epic.db",
    "patients_census.csv": "722232dc-e651-44b3-9510-e79f4d72304f-patients_census.csv",
    "run_agent_demo.py": "66e293e3-5b9c-4b46-8921-21108ffd5136-run_agent_demo.py",
}
TABLES = {
    "census": "patients_census",
    "nurse": "epic_optime_nurse_logs",
    "surgeon": "epic_surgeon_op_notes",
    "recovery": "epic_postop_nursing_labs",
    "claim": "claims_baseline_vs_agent",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--attachments", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    target = root / "public" / "inputs"
    target.mkdir(parents=True, exist_ok=True)
    manifests = []
    for name, attachment in FILES.items():
        source = args.attachments / attachment
        original = source.read_bytes()
        destination = target / name
        shutil.copyfile(source, destination)
        assert destination.read_bytes() == original
        manifests.append({
            "name": name, "bytes": len(original),
            "sha256": hashlib.sha256(original).hexdigest(),
            "untouched": True,
        })
    db = args.attachments / FILES["neuro_rcm_epic.db"]
    connection = sqlite3.connect(db.as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    tables = {}
    for label, table in TABLES.items():
        rows = [dict(row) for row in connection.execute(f"SELECT * FROM {table} ORDER BY encounter_id")]
        assert len(rows) == 80, f"{table}: expected 80 rows"
        with (target / f"{table}.csv").open(encoding="utf-8-sig", newline="") as stream:
            csv_rows = list(csv.DictReader(stream))
        assert len(csv_rows) == len(rows), f"{table}: CSV/DB count differs"
        csv_by_id = {row["encounter_id"]: row for row in csv_rows}
        for row in rows:
            for key, value in row.items():
                assert csv_by_id[row["encounter_id"]][key] == str(value), f"{table}.{key}: CSV/DB mismatch"
        tables[label] = {row["encounter_id"]: row for row in rows}
    encounters = []
    for encounter_id in tables["census"]:
        encounter = {"id": encounter_id}
        for label in TABLES:
            encounter[label] = tables[label][encounter_id]
        encounters.append(encounter)
    rules = [dict(row) for row in connection.execute("SELECT * FROM icd10_drg_reference ORDER BY rule_id")]
    connection.close()
    data = {
        "encounters": encounters, "rules": rules, "files": manifests,
        "sourceTotals": {
            "encounters": len(encounters),
            "baseline": sum(e["claim"]["baseline_reimbursement_usd"] for e in encounters),
            "proposed": sum(e["claim"]["optimized_reimbursement_usd"] for e in encounters),
            "exposure": sum(e["claim"]["revenue_left_on_table_usd"] for e in encounters),
            "flagged": sum(e["claim"]["revenue_leakage_occurred"] for e in encounters),
        },
    }
    out = root / "src" / "data" / "imported.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=True, indent=2), encoding="utf-8")
    (target / "manifest.json").write_text(json.dumps(manifests, indent=2), encoding="utf-8")
    print(json.dumps(data["sourceTotals"]))
    print("9 source files copied byte-for-byte; five 80-row CSV tables reconcile with the read-only SQLite database.")


if __name__ == "__main__":
    main()
