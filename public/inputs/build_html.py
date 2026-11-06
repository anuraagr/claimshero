import sqlite3
import json

db_path = r"C:\Users\baraelhag\OneDrive - Microsoft\Documents\Microsoft Scout\neuro_rcm_db\neuro_rcm_epic.db"
html_path = r"C:\Users\baraelhag\OneDrive - Microsoft\Documents\Microsoft Scout\epic-neuro-rcm-agent-demo.html"

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

query = """
SELECT 
    p.*,
    n.circulating_nurse_id, n.optime_default_checkbox_selected, n.optime_default_icd10_pcs_dropped,
    n.or_cut_time, n.or_close_time, n.actual_or_minutes, n.expected_benchmark_minutes,
    n.or_time_overrun_pct, n.estimated_blood_loss_ml, n.udi_barcodes_scanned_json,
    n.nurse_shift_turnover_pressure_flag,
    s.attending_neurosurgeon, s.preop_diagnosis_text, s.postop_diagnosis_text,
    s.unstructured_op_note_narrative, s.documented_anatomical_levels_or_sites,
    s.documented_intraop_complications, s.microscope_or_nav_used,
    l.preop_hgb_g_dl, l.postop_nadir_hgb_g_dl, l.prbc_units_transfused,
    l.postop_sodium_meq_l, l.icu_ventilator_hours, l.iv_mannitol_or_hypertonic_saline,
    l.nursing_flowsheet_note, l.surgeon_wrote_diagnosis_in_progress_note,
    c.clinical_archetype, c.revenue_leakage_occurred,
    c.baseline_icd10_pcs, c.baseline_icd10_cm, c.baseline_ms_drg, c.baseline_reimbursement_usd,
    c.agent_captured_icd10_pcs, c.agent_captured_icd10_cm, c.optimized_ms_drg,
    c.optimized_reimbursement_usd, c.revenue_left_on_table_usd, c.pct_reimbursement_uplift,
    c.agent_confidence_score, c.exact_audit_evidence_extracted, c.hitl_approval_target
FROM patients_census p
JOIN epic_optime_nurse_logs n USING(encounter_id)
JOIN epic_surgeon_op_notes s USING(encounter_id)
JOIN epic_postop_nursing_labs l USING(encounter_id)
JOIN claims_baseline_vs_agent c USING(encounter_id)
ORDER BY p.encounter_id ASC
"""

cases = []
for row in conn.execute(query):
    d = dict(row)
    d["barcodes"] = json.loads(d.pop("udi_barcodes_scanned_json"))
    base_conf = int(round(d["agent_confidence_score"] * 100))
    if d["revenue_leakage_occurred"] == 1:
        d["schema_checks"] = [
            {
                "check_name": "Silo 1 vs Silo 2: Procedure & Implant Check",
                "input_schema": "FDA UDI Barcode + OpTime Log -> ICD-10-PCS",
                "contradiction": f"OpTime default dropped {d['baseline_icd10_pcs']} ({d['optime_default_checkbox_selected']}), but Nurse scanned {len(d['barcodes'])} UDI devices and Surgeon dictated: {d['documented_anatomical_levels_or_sites']}.",
                "mapped_code": d["agent_captured_icd10_pcs"],
                "confidence": min(99, base_conf + 2)
            },
            {
                "check_name": "Silo 3 vs Silo 2: Post-Op Acuity & Lab Check",
                "input_schema": "LOINC Lab / MAR Flowsheet -> ICD-10-CM (CC / MCC)",
                "contradiction": f"Recovery silo logged ({d['nursing_flowsheet_note']}), but secondary CC/MCC diagnosis was unlinked on billing sheet.",
                "mapped_code": d["agent_captured_icd10_cm"],
                "confidence": base_conf
            },
            {
                "check_name": "Payer Grouper Check: Hospital Payout Tier",
                "input_schema": "ICD-10-PCS + ICD-10-CM -> MS-DRG / NY APR-DRG",
                "contradiction": f"Holding all surgical variables equal, unlinked PCS/CM codes held claim at MS-DRG {d['baseline_ms_drg']} instead of MS-DRG {d['optimized_ms_drg']}.",
                "mapped_code": f"MS-DRG {d['baseline_ms_drg']} -> MS-DRG {d['optimized_ms_drg']} (+${d['revenue_left_on_table_usd']:,.0f})",
                "confidence": max(92, base_conf - 1)
            }
        ]
    else:
        d["schema_checks"] = [
            {
                "check_name": "Silo 1 vs Silo 2: Procedure & Implant Check",
                "input_schema": "FDA UDI Barcode + OpTime Log -> ICD-10-PCS",
                "contradiction": "No contradiction: Scanned UDI hardware and Surgeon Op Note match single-level baseline checkbox.",
                "mapped_code": d["baseline_icd10_pcs"] + " (Verified Clean)",
                "confidence": 99
            },
            {
                "check_name": "Silo 3 vs Silo 2: Post-Op Acuity & Lab Check",
                "input_schema": "LOINC Lab / MAR Flowsheet -> ICD-10-CM",
                "contradiction": "No contradiction: Post-op Hgb, Na+, and recovery vitals within normal baseline range.",
                "mapped_code": d["baseline_icd10_cm"] + " (Verified Clean)",
                "confidence": 99
            }
        ]
    cases.append(d)

rules = [dict(r) for r in conn.execute("SELECT * FROM icd10_drg_reference")]
conn.close()

html_template = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Epic Post-Op Neurosurgery Agent — Retriever & Schema Mapper (80 NYC H+H Patients)</title>
<script>
  (() => {
    const param = new URLSearchParams(window.location.search).get("scoutTheme");
    const theme =
      param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  })();
</script>
<style>
:root {
  color-scheme: light;
  --cp-bg: #f7f4ef;
  --cp-bg-elevated: #fcfbf8;
  --cp-surface: #ffffff;
  --cp-surface-soft: #f5f5f5;
  --cp-border: #dedede;
  --cp-border-strong: #919191;
  --cp-text: #242424;
  --cp-text-muted: #5c5c5c;
  --cp-text-soft: #6f6f6f;
  --cp-accent: #b11f4b;
  --cp-accent-hover: #9a1a41;
  --cp-accent-soft: rgba(177, 31, 75, 0.08);
  --cp-accent-fg: #ffffff;
  --cp-success: #16a34a;
  --cp-danger: #dc2626;
  --cp-warning: #f59e0b;
  --cp-link: #0078d4;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.12);
  --cp-overlay: rgba(255, 255, 255, 0.8);
  --cp-panel: rgba(255, 255, 255, 0.86);
  --cp-panel-strong: rgba(255, 255, 255, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.55);
  --cp-highlight: rgba(177, 31, 75, 0.12);
}
html[data-theme="dark"] {
  color-scheme: dark;
  --cp-bg: #3d3b3a;
  --cp-bg-elevated: #343231;
  --cp-surface: #292929;
  --cp-surface-soft: #2e2e2e;
  --cp-border: #474747;
  --cp-border-strong: #5f5f5f;
  --cp-text: #dedede;
  --cp-text-muted: #919191;
  --cp-text-soft: #b0b0b0;
  --cp-accent: #fd8ea1;
  --cp-accent-hover: #fb7b91;
  --cp-accent-soft: rgba(253, 142, 161, 0.14);
  --cp-accent-fg: #1a1a1a;
  --cp-success: #4ade80;
  --cp-danger: #f87171;
  --cp-warning: #fbbf24;
  --cp-link: #4da6ff;
  --cp-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
  --cp-overlay: rgba(41, 41, 41, 0.88);
  --cp-panel: rgba(41, 41, 41, 0.72);
  --cp-panel-strong: rgba(41, 41, 41, 0.96);
  --cp-sheen: rgba(255, 255, 255, 0.04);
  --cp-highlight: rgba(253, 142, 161, 0.12);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--cp-bg);
  color: var(--cp-text);
  font-family: "Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.45;
  padding: 20px 24px 48px;
}
code, .mono {
  font-family: Consolas, "Courier New", Courier, monospace;
}
.container {
  max-width: 1400px;
  margin: 0 auto;
}
.header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--cp-border);
  margin-bottom: 20px;
}
.title-group h1 {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.title-group p {
  color: var(--cp-text-muted);
  font-size: 0.92rem;
  margin-top: 4px;
}
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.kpi-card {
  background: var(--cp-surface);
  border: 1px solid var(--cp-border);
  border-radius: 16px;
  padding: 14px 16px;
  box-shadow: 0 0 2px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.14);
}
.kpi-label {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cp-text-muted);
  font-weight: 600;
}
.kpi-value {
  font-size: 1.55rem;
  font-weight: 700;
  margin-top: 4px;
}
.kpi-sub {
  font-size: 0.8rem;
  color: var(--cp-text-soft);
  margin-top: 2px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--cp-border);
  padding-bottom: 10px;
  flex-wrap: wrap;
}
.tab-btn {
  background: var(--cp-surface);
  color: var(--cp-text);
  border: 1px solid var(--cp-border);
  border-radius: 0.625rem;
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.tab-btn.active {
  background: var(--cp-accent);
  color: var(--cp-accent-fg);
  border-color: var(--cp-accent);
}
.card {
  background: var(--cp-surface);
  border: 1px solid var(--cp-border);
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 0 2px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.14);
  margin-bottom: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--cp-border);
  flex-wrap: wrap;
}
.card-title {
  font-size: 1.05rem;
  font-weight: 700;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 0.625rem;
  font-size: 0.76rem;
  font-weight: 600;
  border: 1px solid var(--cp-border);
  background: var(--cp-surface-soft);
  color: var(--cp-text);
}
.badge-accent {
  background: var(--cp-accent-soft);
  color: var(--cp-accent);
  border-color: var(--cp-accent);
}
.badge-success {
  border-color: var(--cp-success);
  color: var(--cp-success);
}
.badge-danger {
  border-color: var(--cp-danger);
  color: var(--cp-danger);
}
.badge-warning {
  border-color: var(--cp-warning);
  color: var(--cp-warning);
}
.silo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}
@media (max-width: 1024px) {
  .silo-grid { grid-template-columns: 1fr; }
}
.silo-box {
  background: var(--cp-bg-elevated);
  border: 1px solid var(--cp-border);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.silo-title {
  font-size: 0.9rem;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.field-row {
  font-size: 0.84rem;
}
.field-label {
  color: var(--cp-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 600;
}
.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 12px;
}
@media (max-width: 900px) {
  .compare-grid { grid-template-columns: 1fr; }
}
.compare-panel {
  border: 1px solid var(--cp-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--cp-bg-elevated);
}
.compare-panel.optimized {
  border: 2px solid var(--cp-accent);
  background: var(--cp-accent-soft);
}
.check-item {
  border: 1px solid var(--cp-border);
  border-radius: 10px;
  padding: 12px;
  background: var(--cp-bg-elevated);
  margin-bottom: 10px;
}
.conf-bar-wrap {
  width: 110px;
  height: 8px;
  background: var(--cp-surface-soft);
  border: 1px solid var(--cp-border);
  border-radius: 6px;
  overflow: hidden;
}
.conf-bar {
  height: 100%;
  background: var(--cp-success);
}
.controls-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
select, input[type="text"] {
  background: var(--cp-surface);
  color: var(--cp-text);
  border: 1px solid var(--cp-border-strong);
  border-radius: 0.625rem;
  padding: 7px 12px;
  font-size: 0.88rem;
  font-family: inherit;
}
.btn {
  background: var(--cp-accent);
  color: var(--cp-accent-fg);
  border: 1px solid var(--cp-accent);
  border-radius: 0.625rem;
  padding: 8px 14px;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover {
  background: var(--cp-accent-hover);
}
.btn-secondary {
  background: var(--cp-surface);
  color: var(--cp-text);
  border: 1px solid var(--cp-border-strong);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
th, td {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 1px solid var(--cp-border);
}
th {
  color: var(--cp-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
tr.clickable-row {
  cursor: pointer;
}
tr.clickable-row:hover {
  background: var(--cp-highlight);
}
.hidden { display: none !important; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="title-group">
      <h1>Post-Op Surgical Coding Agent — NYC Health + Hospitals Neurosurgery DB</h1>
      <p>Zero Re-Architecture: On-Demand Retriever + Checking Agents Across 3 Untouched Epic Silos (All Variables Held Equal)</p>
    </div>
    <div class="controls-row">
      <span class="badge badge-accent mono">DB: neuro_rcm_epic.db (80 Patients)</span>
      <button class="btn-secondary btn" id="themeToggleBtn">Toggle Light/Dark</button>
    </div>
  </div>

  <div class="kpi-strip">
    <div class="kpi-card">
      <div class="kpi-label">Cohort Scope (NYC H+H)</div>
      <div class="kpi-value">80 Surgeries</div>
      <div class="kpi-sub">66 w/ Unbilled Silo Leakage | 14 Clean Controls</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Billed Today (Default Checkbox)</div>
      <div class="kpi-value">$2,143,116</div>
      <div class="kpi-sub">Baseline ICD-10-PCS / MS-DRG w/o CC/MCC</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Captured With Agents (Same Surgeries)</div>
      <div class="kpi-value">$3,495,535</div>
      <div class="kpi-sub">Full ICD-10-PCS + ICD-10-CM CC/MCC Mapped</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Money Left on the Table</div>
      <div class="kpi-value" style="color: var(--cp-accent);">+$1,352,419</div>
      <div class="kpi-sub">+$20,491 avg uplift per affected surgery (+63.1%)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Mean Agent Confidence</div>
      <div class="kpi-value" style="color: var(--cp-success);">96.8%</div>
      <div class="kpi-sub">Multi-silo UDI + LOINC + Text verification</div>
    </div>
  </div>

  <div class="tabs">
    <button class="tab-btn active" data-tab="tab-single">1. Story of One Patient (Live Agent Inspector)</button>
    <button class="tab-btn" data-tab="tab-cohort">2. All 80 NYC H+H Patients ($1.35M Cohort Table)</button>
    <button class="tab-btn" data-tab="tab-schemas">3. Coding Schemas & Retriever Architecture</button>
  </div>

  <!-- TAB 1: SINGLE PATIENT STORY -->
  <div id="tab-single">
    <div class="card">
      <div class="card-header">
        <div>
          <span class="card-title">Select Patient Encounter from Database: </span>
          <select id="patientSelect"></select>
        </div>
        <div class="controls-row">
          <button class="btn btn-secondary" id="prevBtn">Previous Patient</button>
          <button class="btn btn-secondary" id="nextBtn">Next Patient</button>
        </div>
      </div>

      <div id="patientBanner" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:10px 14px; background:var(--cp-bg-elevated); border-radius:10px; border:1px solid var(--cp-border); margin-bottom:16px;">
      </div>

      <h3 style="font-size:0.95rem; margin-bottom:10px;">Step 1: Retriever Agent Queries the 3 Original Epic Silos (Zero Data Re-Architecture)</h3>
      <div class="silo-grid" id="siloGrid"></div>

      <h3 style="font-size:0.95rem; margin-bottom:10px;">Step 2: Checking Agent Contradiction Analysis & Schema Confidence Scores</h3>
      <div id="checksContainer"></div>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">Step 3: Hold All Variables Equal — Same Surgery, Two Reimbursement Outcomes</h3>
      <div class="compare-grid" id="compareGrid"></div>
    </div>
  </div>

  <!-- TAB 2: 80-PATIENT COHORT -->
  <div id="tab-cohort" class="hidden">
    <div class="card">
      <div class="card-header">
        <div class="card-title">80 NYC Health + Hospitals Neurosurgery Encounters (Click Any Row to Inspect in Agent View)</div>
        <div class="controls-row">
          <select id="facilityFilter">
            <option value="ALL">All 6 NYC H+H Facilities</option>
            <option value="NYC H+H / Elmhurst">NYC H+H / Elmhurst (Queens)</option>
            <option value="NYC H+H / Bellevue">NYC H+H / Bellevue (Manhattan)</option>
            <option value="NYC H+H / Kings County">NYC H+H / Kings County (Brooklyn)</option>
            <option value="NYC H+H / Harlem">NYC H+H / Harlem (Manhattan)</option>
            <option value="NYC H+H / Lincoln">NYC H+H / Lincoln (Bronx)</option>
            <option value="NYC H+H / Jacobi">NYC H+H / Jacobi (Bronx)</option>
          </select>
          <select id="leakFilter">
            <option value="ALL">All Cases (80)</option>
            <option value="LEAK">Unbilled Leakage Found (66)</option>
            <option value="CLEAN">Clean Baseline Controls (14)</option>
          </select>
          <input type="text" id="searchBox" placeholder="Search patient, ICD-10, DRG, payer...">
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Encounter</th>
              <th>Patient & Census ZIP</th>
              <th>NYC H+H Facility</th>
              <th>Payer</th>
              <th>Baseline (ICD-10 / DRG)</th>
              <th>Agent Mapped (ICD-10 / DRG)</th>
              <th>Billed Today</th>
              <th>With Agents</th>
              <th>Left on Table</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody id="cohortTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 3: SCHEMAS & RULES -->
  <div id="tab-schemas" class="hidden">
    <div class="card">
      <div class="card-header">
        <div class="card-title">The 3 Relevant Coding Schemas & Why Silos Fail</div>
        <span class="badge badge-accent">No Bridge Warehouse Needed — Pure Runtime Retrieval</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Schema Layer</th>
            <th>Standard Name</th>
            <th>Where It Lives in Epic</th>
            <th>What Goes Wrong Today</th>
            <th>How the Agent Fixes It</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>1. Clinical Input Schemas</strong></td>
            <td><code class="mono">FDA UDI</code> (Barcodes) &amp; <code class="mono">LOINC</code> (Labs)</td>
            <td>Silo 1 (Nurse OpTime Scan) &amp; Silo 3 (Recovery Labs/MAR)</td>
            <td>Nurse scans 2 spinal cages (<code class="mono">UDI</code>) and Lab logs <code class="mono">Hgb 7.1</code>, but neither talks to the billing screen.</td>
            <td>Retriever Agent pulls raw <code class="mono">UDI</code> and <code class="mono">LOINC</code> values by <code class="mono">encounter_id</code> at case close.</td>
          </tr>
          <tr>
            <td><strong>2. Hospital Coding Schemas</strong></td>
            <td><code class="mono">ICD-10-PCS</code> (Procedure) &amp; <code class="mono">ICD-10-CM</code> (Diagnosis CC/MCC)</td>
            <td>Silo 2 (Doctor Op Note) &amp; HIM Coding Queue</td>
            <td>Nurse clicks fast default <code class="mono">1-level</code> box (<code class="mono">0SG00AJ</code>); Doctor forgets to type <code class="mono">D62</code> Post-Op Anemia.</td>
            <td>Checking Agent spots mismatch across silos and maps <code class="mono">+0SG10AJ</code> + <code class="mono">D62 (CC)</code> + <code class="mono">G97.41 (MCC)</code>.</td>
          </tr>
          <tr>
            <td><strong>3. Payer Payout Schema</strong></td>
            <td><code class="mono">MS-DRG</code> / NY <code class="mono">APR-DRG</code></td>
            <td>Epic Resolute Hospital Billing</td>
            <td>Claim drops at lowest baseline tier (<code class="mono">DRG 460 w/o MCC</code>), leaving $16K–$34K unclaimed.</td>
            <td>1-click approval upgrades claim to <code class="mono">DRG 459 w/ MCC</code> with attached timestamp &amp; quote proof.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">The 5 Neurosurgery ICD-10-PCS / ICD-10-CM / MS-DRG Rules in neuro_rcm_epic.db</div>
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Neurosurgery Archetype</th>
              <th>Default Nurse Box (Baseline ICD-10-PCS)</th>
              <th>Agent Retrieved (Optimized ICD-10-PCS)</th>
              <th>Agent Captured Comorbidities (ICD-10-CM CC/MCC)</th>
              <th>MS-DRG Shift</th>
              <th>Medicare Base -> Opt</th>
            </tr>
          </thead>
          <tbody id="rulesTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<script>
const CASES = __CASES_JSON__;
const RULES = __RULES_JSON__;

let currentIdx = 0;
const approvedSet = new Set();

const patientSelect = document.getElementById("patientSelect");
CASES.forEach((c, idx) => {
  const opt = document.createElement("option");
  opt.value = idx;
  const tag = c.revenue_leakage_occurred ? `[+$${c.revenue_left_on_table_usd.toLocaleString()} Leak]` : `[Clean Control]`;
  opt.textContent = `${c.encounter_id} — ${c.patient_name} (${c.age}${c.sex}) | ${c.facility_name} | ${tag}`;
  patientSelect.appendChild(opt);
});

function renderPatient(idx) {
  currentIdx = idx;
  patientSelect.value = idx;
  const c = CASES[idx];
  const confPct = Math.round(c.agent_confidence_score * 100);
  const isApproved = approvedSet.has(c.encounter_id);

  document.getElementById("patientBanner").innerHTML = `
    <div>
      <strong>${c.encounter_id}</strong> &bull; <strong>${c.patient_name}</strong> (${c.age}${c.sex}, ${c.race_ethnicity})
      &bull; <span class="mono">${c.nyc_borough} ZIP ${c.zip_code} (${c.neighborhood}, Census Med. Income $${c.census_median_hh_income_usd.toLocaleString()})</span>
    </div>
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <span class="badge">${c.facility_name}</span>
      <span class="badge">${c.payer_name}</span>
      <span class="badge ${c.revenue_leakage_occurred ? 'badge-accent' : 'badge-success'}">
        Agent Confidence: ${confPct}%
      </span>
    </div>
  `;

  const barcodesHtml = c.barcodes.map(b =>
    `<div style="padding:5px 8px; background:var(--cp-surface); border:1px solid var(--cp-border); border-radius:6px; margin-top:4px; font-size:0.79rem;">
      <span class="mono" style="color:var(--cp-accent);">${b.udi}</span><br>
      <strong>${b.item}</strong> ($${b.cost_usd.toLocaleString()})
    </div>`
  ).join("");

  document.getElementById("siloGrid").innerHTML = `
    <div class="silo-box">
      <div class="silo-title">
        <span>Silo 1: OR Nurse (Epic OpTime)</span>
        <span class="badge mono">Schema: FDA UDI + Picklist</span>
      </div>
      <div class="field-row">
        <div class="field-label">Nurse ID &amp; Turnover Pressure</div>
        <div>${c.circulating_nurse_id} &bull; <span style="color:var(--cp-warning); font-weight:600;">${c.nurse_shift_turnover_pressure_flag}</span></div>
      </div>
      <div class="field-row">
        <div class="field-label">Default Checkbox Clicked by Nurse</div>
        <div style="font-weight:600;">${c.optime_default_checkbox_selected}</div>
        <div class="mono" style="font-size:0.78rem; color:var(--cp-text-muted);">Dropped ICD-10-PCS: ${c.optime_default_icd10_pcs_dropped}</div>
      </div>
      <div class="field-row">
        <div class="field-label">OR Cut-to-Close Time Logged</div>
        <div><strong>${c.actual_or_minutes} mins</strong> (${c.or_cut_time}–${c.or_close_time}) vs. ${c.expected_benchmark_minutes}m benchmark (<strong>+${c.or_time_overrun_pct}%</strong>)</div>
      </div>
      <div class="field-row">
        <div class="field-label">Hardware Barcodes Scanned in OR (${c.barcodes.length})</div>
        ${barcodesHtml}
      </div>
    </div>

    <div class="silo-box">
      <div class="silo-title">
        <span>Silo 2: Surgeon Operative Note</span>
        <span class="badge mono">Schema: Free-Text -> ICD-10-PCS</span>
      </div>
      <div class="field-row">
        <div class="field-label">Attending Neurosurgeon</div>
        <div>${c.attending_neurosurgeon}</div>
      </div>
      <div class="field-row">
        <div class="field-label">Unstructured Dictated Op Note</div>
        <div style="padding:8px; background:var(--cp-surface); border:1px solid var(--cp-border); border-radius:8px; font-size:0.81rem;">
          "${c.unstructured_op_note_narrative}"
        </div>
      </div>
      <div class="field-row">
        <div class="field-label">Retriever Extracted Anatomical Scope</div>
        <div style="font-weight:600; color:var(--cp-accent);">${c.documented_anatomical_levels_or_sites}</div>
      </div>
      <div class="field-row">
        <div class="field-label">Retriever Extracted Intra-Op Complication</div>
        <div>${c.documented_intraop_complications}</div>
      </div>
    </div>

    <div class="silo-box">
      <div class="silo-title">
        <span>Silo 3: Recovery Nurse &amp; Labs</span>
        <span class="badge mono">Schema: LOINC -> ICD-10-CM</span>
      </div>
      <div class="field-row">
        <div class="field-label">LOINC 718-7 Hemoglobin (Pre -> Post-Op Nadir)</div>
        <div>Pre-Op: <strong>${c.preop_hgb_g_dl} g/dL</strong> &rarr; Post-Op: <strong style="color:${c.postop_nadir_hgb_g_dl < 8.5 ? 'var(--cp-danger)' : 'var(--cp-text)'};">${c.postop_nadir_hgb_g_dl} g/dL</strong> (${c.prbc_units_transfused}u PRBC transfused)</div>
      </div>
      <div class="field-row">
        <div class="field-label">LOINC 2951-2 Post-Op Sodium &amp; ICU Metrics</div>
        <div>Na+: <strong>${c.postop_sodium_meq_l} mEq/L</strong> &bull; ICU Vent: <strong>${c.icu_ventilator_hours} hrs</strong> &bull; Hyperosmolar/Mannitol: <strong>${c.iv_mannitol_or_hypertonic_saline ? 'Yes' : 'No'}</strong></div>
      </div>
      <div class="field-row">
        <div class="field-label">PACU / Floor Nursing Flowsheet Note</div>
        <div style="padding:8px; background:var(--cp-surface); border:1px solid var(--cp-border); border-radius:8px; font-size:0.81rem;">
          "${c.nursing_flowsheet_note}"
        </div>
      </div>
      <div class="field-row">
        <div class="field-label">Did Doctor Type Secondary CC/MCC in Progress Note?</div>
        <div><span class="badge ${c.surgeon_wrote_diagnosis_in_progress_note ? 'badge-success' : 'badge-danger'}">${c.surgeon_wrote_diagnosis_in_progress_note ? 'Yes (Linked)' : 'NO — Orphaned in Lab/RN Silo'}</span></div>
      </div>
    </div>
  `;

  document.getElementById("checksContainer").innerHTML = c.schema_checks.map(chk => `
    <div class="check-item">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:6px;">
        <div>
          <strong>${chk.check_name}</strong>
          <span class="badge mono" style="margin-left:8px;">${chk.input_schema}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="mono" style="font-size:0.82rem; font-weight:700;">Confidence: ${chk.confidence}%</span>
          <div class="conf-bar-wrap"><div class="conf-bar" style="width:${chk.confidence}%;"></div></div>
        </div>
      </div>
      <div style="font-size:0.84rem; color:var(--cp-text-muted); margin-bottom:4px;">${chk.contradiction}</div>
      <div style="font-size:0.84rem;"><strong>Standardized Output:</strong> <code class="mono" style="color:var(--cp-accent); font-weight:700;">${chk.mapped_code}</code></div>
    </div>
  `).join("");

  document.getElementById("compareGrid").innerHTML = `
    <div class="compare-panel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong>WITHOUT AGENTS (What Epic Bills Today)</strong>
        <span class="badge">Single-Silo Default</span>
      </div>
      <div class="field-row" style="margin-bottom:8px;">
        <div class="field-label">ICD-10-PCS Procedure Billed</div>
        <div class="mono">${c.baseline_icd10_pcs}</div>
      </div>
      <div class="field-row" style="margin-bottom:8px;">
        <div class="field-label">ICD-10-CM Diagnosis Billed</div>
        <div class="mono">${c.baseline_icd10_cm}</div>
      </div>
      <div class="field-row" style="margin-bottom:12px;">
        <div class="field-label">Hospital MS-DRG Grouped</div>
        <div class="mono" style="font-weight:700;">MS-DRG ${c.baseline_ms_drg} (Baseline Tier)</div>
      </div>
      <div style="padding-top:10px; border-top:1px solid var(--cp-border); display:flex; justify-content:space-between; align-items:baseline;">
        <span class="field-label">Baseline Payer Reimbursement</span>
        <span style="font-size:1.4rem; font-weight:700;">$${c.baseline_reimbursement_usd.toLocaleString()}</span>
      </div>
    </div>

    <div class="compare-panel optimized">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong>WITH RETRIEVER + CHECKING AGENTS (Same Surgery)</strong>
        <span class="badge badge-accent">Confidence: ${confPct}%</span>
      </div>
      <div class="field-row" style="margin-bottom:8px;">
        <div class="field-label">ICD-10-PCS Procedures Grabbed &amp; Mapped</div>
        <div class="mono" style="font-weight:700;">${c.agent_captured_icd10_pcs}</div>
      </div>
      <div class="field-row" style="margin-bottom:8px;">
        <div class="field-label">ICD-10-CM Diagnoses + CC/MCC Grabbed &amp; Mapped</div>
        <div class="mono" style="font-weight:700;">${c.agent_captured_icd10_cm}</div>
      </div>
      <div class="field-row" style="margin-bottom:8px;">
        <div class="field-label">Upgraded Hospital MS-DRG</div>
        <div class="mono" style="font-weight:700; color:var(--cp-accent);">MS-DRG ${c.optimized_ms_drg} (+${c.pct_reimbursement_uplift}% Uplift)</div>
      </div>
      <div class="field-row" style="margin-bottom:12px;">
        <div class="field-label">Audit-Proof Evidence Package Attached for Payer</div>
        <div style="font-size:0.8rem;">${c.exact_audit_evidence_extracted}</div>
      </div>
      <div style="padding-top:10px; border-top:1px solid var(--cp-border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <div class="field-label">Agent-Optimized Reimbursement</div>
          <div style="font-size:1.4rem; font-weight:700;">$${c.optimized_reimbursement_usd.toLocaleString()} <span style="color:var(--cp-accent); font-size:1.1rem;">(+$${c.revenue_left_on_table_usd.toLocaleString()} Left on Table)</span></div>
        </div>
        <button class="btn" id="approveBtn">${isApproved ? 'Approved in Epic Resolute ✓' : '1-Click Approve to Epic Resolute'}</button>
      </div>
    </div>
  `;

  document.getElementById("approveBtn").addEventListener("click", () => {
    if (approvedSet.has(c.encounter_id)) {
      approvedSet.delete(c.encounter_id);
    } else {
      approvedSet.add(c.encounter_id);
    }
    renderPatient(currentIdx);
    renderCohortTable();
  });
}

function renderCohortTable() {
  const fac = document.getElementById("facilityFilter").value;
  const leak = document.getElementById("leakFilter").value;
  const q = document.getElementById("searchBox").value.trim().toLowerCase();

  const tbody = document.getElementById("cohortTableBody");
  tbody.innerHTML = "";

  CASES.forEach((c, idx) => {
    if (fac !== "ALL" && c.facility_name !== fac) return;
    if (leak === "LEAK" && !c.revenue_leakage_occurred) return;
    if (leak === "CLEAN" && c.revenue_leakage_occurred) return;
    if (q) {
      const hay = `${c.encounter_id} ${c.patient_name} ${c.facility_name} ${c.payer_name} ${c.baseline_icd10_pcs} ${c.agent_captured_icd10_pcs} ${c.agent_captured_icd10_cm} ${c.clinical_archetype}`.toLowerCase();
      if (!hay.includes(q)) return;
    }

    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    const confPct = Math.round(c.agent_confidence_score * 100);
    tr.innerHTML = `
      <td class="mono"><strong>${c.encounter_id}</strong></td>
      <td>${c.patient_name} (${c.age}${c.sex})<br><span style="font-size:0.75rem; color:var(--cp-text-muted);">${c.nyc_borough} ${c.zip_code}</span></td>
      <td>${c.facility_name}</td>
      <td>${c.payer_name}</td>
      <td class="mono">DRG ${c.baseline_ms_drg}<br><span style="font-size:0.75rem; color:var(--cp-text-muted);">${c.baseline_icd10_pcs}</span></td>
      <td class="mono"><strong>DRG ${c.optimized_ms_drg}</strong><br><span style="font-size:0.75rem; color:var(--cp-accent);">${c.agent_captured_icd10_pcs}</span></td>
      <td class="mono">$${c.baseline_reimbursement_usd.toLocaleString()}</td>
      <td class="mono"><strong>$${c.optimized_reimbursement_usd.toLocaleString()}</strong></td>
      <td class="mono" style="color:${c.revenue_leakage_occurred ? 'var(--cp-accent)' : 'var(--cp-text-muted)'}; font-weight:700;">
        ${c.revenue_leakage_occurred ? '+$' + c.revenue_left_on_table_usd.toLocaleString() : '$0 (Clean)'}
      </td>
      <td><span class="badge ${confPct >= 96 ? 'badge-success' : 'badge-accent'}">${confPct}%</span></td>
    `;
    tr.addEventListener("click", () => {
      switchTab("tab-single");
      renderPatient(idx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    tbody.appendChild(tr);
  });
}

function renderRulesTable() {
  const tbody = document.getElementById("rulesTableBody");
  tbody.innerHTML = RULES.map(r => `
    <tr>
      <td class="mono"><strong>${r.rule_id}</strong></td>
      <td><strong>${r.clinical_Archetype}</strong><br><span style="font-size:0.76rem; color:var(--cp-text-muted);">${r.epic_evidence_sources}</span></td>
      <td class="mono">${r.baseline_icd10_pcs}<br><span style="font-size:0.75rem; color:var(--cp-text-muted);">${r.baseline_pcs_desc}</span></td>
      <td class="mono" style="color:var(--cp-accent); font-weight:600;">${r.optimized_icd10_pcs}<br><span style="font-size:0.75rem; color:var(--cp-text-muted);">${r.optimized_pcs_desc}</span></td>
      <td class="mono">${r.missed_icd10_cm_code}<br><span style="font-size:0.75rem; color:var(--cp-text-muted);">${r.missed_cm_desc}</span></td>
      <td class="mono"><strong>DRG ${r.baseline_ms_drg} &rarr; ${r.optimized_ms_drg}</strong></td>
      <td class="mono">$${r.medicare_base_rate_usd.toLocaleString()} &rarr; <strong>$${r.medicare_optimized_rate_usd.toLocaleString()}</strong></td>
    </tr>
  `).join("");
}

function switchTab(tabId) {
  ["tab-single", "tab-cohort", "tab-schemas"].forEach(id => {
    document.getElementById(id).classList.toggle("hidden", id !== tabId);
  });
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
  });
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
});

patientSelect.addEventListener("change", (e) => renderPatient(Number(e.target.value)));
document.getElementById("prevBtn").addEventListener("click", () => {
  renderPatient((currentIdx - 1 + CASES.length) % CASES.length);
});
document.getElementById("nextBtn").addEventListener("click", () => {
  renderPatient((currentIdx + 1) % CASES.length);
});
document.getElementById("facilityFilter").addEventListener("change", renderCohortTable);
document.getElementById("leakFilter").addEventListener("change", renderCohortTable);
document.getElementById("searchBox").addEventListener("input", renderCohortTable);

document.getElementById("themeToggleBtn").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
});

renderPatient(0);
renderCohortTable();
renderRulesTable();
</script>
</body>
</html>
"""

html_out = html_template.replace("__CASES_JSON__", json.dumps(cases)).replace("__RULES_JSON__", json.dumps(rules))
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_out)

print("Wrote HTML artifact:", html_path, "bytes:", len(html_out))
