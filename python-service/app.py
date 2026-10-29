from flask import Flask, render_template, request, jsonify
from pathlib import Path
import csv
import numpy as np

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
WEIGHTS_PATH = BASE_DIR / "dqn_weights.npz"
RESULTS_PATH = BASE_DIR / "mri_scheduling_results.csv"

PRIORITY_SCORE = {"Emergency": 3, "High": 2, "Normal": 1}
ACTION_SIZE = 4
STATE_SIZE = 12


def load_weights():
    data = np.load(WEIGHTS_PATH)
    return {key: data[key] for key in data.files}


WEIGHTS = load_weights()


def relu(x):
    return np.maximum(x, 0.0)


def predict_q_values(state):
    """Exact dense-network forward pass using the trained exported weights."""
    x = np.asarray(state, dtype=np.float32).reshape(1, -1)
    x = relu(x @ WEIGHTS["W1"] + WEIGHTS["b1"])
    x = relu(x @ WEIGHTS["W2"] + WEIGHTS["b2"])
    x = relu(x @ WEIGHTS["W3"] + WEIGHTS["b3"])
    return (x @ WEIGHTS["W4"] + WEIGHTS["b4"])[0]


def waiting_time(patient, current_time):
    return max(0, int(current_time) - int(patient["arrival_time"]))


def rank_waiting_patients(patients, current_time):
    waiting = [p for p in patients if p["arrival_time"] <= current_time]
    for p in waiting:
        p["priority_score"] = PRIORITY_SCORE[p["priority"]]
        p["waiting_time"] = waiting_time(p, current_time)
    waiting.sort(key=lambda p: (p["priority_score"], p["waiting_time"]), reverse=True)
    return waiting


def build_state(ranked):
    state = []
    for p in ranked[:ACTION_SIZE]:
        state.extend([
            p["priority_score"] / 3.0,
            min(p["waiting_time"], 120) / 120.0,
            p["scan_duration"] / 45.0,
        ])
    while len(state) < STATE_SIZE:
        state.extend([0.0, 0.0, 0.0])
    return np.asarray(state[:STATE_SIZE], dtype=np.float32)


def explain(patient):
    reasons = []
    if patient["priority"] == "Emergency":
        reasons.append("high urgency")
    elif patient["priority"] == "High":
        reasons.append("high priority")
    if patient["waiting_time"] >= 30:
        reasons.append("long waiting time")
    if not reasons:
        reasons.append("the highest estimated Q-value among the current candidates")
    return f"Patient {patient['patient_id']} selected because of " + " and ".join(reasons) + "."


def validate_patients(raw_patients):
    clean = []
    seen = set()
    for raw in raw_patients:
        pid = str(raw.get("patient_id", "")).strip()
        priority = str(raw.get("priority", "")).strip()
        arrival = int(raw.get("arrival_time", 0))
        duration = int(raw.get("scan_duration", 0))
        if not pid:
            raise ValueError("Every patient needs a Patient ID.")
        if pid in seen:
            raise ValueError(f"Duplicate Patient ID: {pid}")
        if priority not in PRIORITY_SCORE:
            raise ValueError(f"Invalid priority for {pid}.")
        if arrival < 0:
            raise ValueError(f"Arrival time for {pid} must be 0 or greater.")
        if duration < 1 or duration > 45:
            raise ValueError(f"Scan duration for {pid} must be between 1 and 45 minutes.")
        seen.add(pid)
        clean.append({
            "patient_id": pid,
            "priority": priority,
            "arrival_time": arrival,
            "scan_duration": duration,
        })
    return clean


def run_full_schedule(patients, current_time):
    remaining = [dict(p) for p in patients]
    schedule = []
    decisions = []
    initial_clock = current_time
    schedule_start = None
    idle_time = 0

    while remaining:
        ranked = rank_waiting_patients(remaining, current_time)

        # If nobody has arrived yet, move the MRI clock to the next arrival.
        if not ranked:
            next_arrival = min(p["arrival_time"] for p in remaining)
            idle_time += max(0, next_arrival - current_time)
            current_time = next_arrival
            ranked = rank_waiting_patients(remaining, current_time)

        state = build_state(ranked)
        q_values = predict_q_values(state)
        action = int(np.argmax(q_values))
        action = min(action, len(ranked) - 1)
        selected = dict(ranked[action])

        selected["waiting_time"] = waiting_time(selected, current_time)
        start_time = current_time
        end_time = start_time + selected["scan_duration"]

        if schedule_start is None:
            schedule_start = start_time

        schedule.append({
            "slot": len(schedule) + 1,
            "patient_id": selected["patient_id"],
            "priority": selected["priority"],
            "arrival_time": selected["arrival_time"],
            "start_time": start_time,
            "end_time": end_time,
            "waiting_time": selected["waiting_time"],
            "scan_duration": selected["scan_duration"],
            "q_value": round(float(q_values[action]), 4),
        })

        candidates = []
        for idx, p in enumerate(ranked[:ACTION_SIZE]):
            candidates.append({
                "rank": idx + 1,
                "patient_id": p["patient_id"],
                "priority": p["priority"],
                "waiting_time": p["waiting_time"],
                "scan_duration": p["scan_duration"],
                "q_value": round(float(q_values[idx]), 4),
                "selected": idx == action,
            })

        decisions.append({
            "decision": len(decisions) + 1,
            "selected_patient": selected["patient_id"],
            "priority": selected["priority"],
            "waiting_time": selected["waiting_time"],
            "q_value": round(float(q_values[action]), 4),
            "start_time": start_time,
            "end_time": end_time,
            "explanation": explain(selected),
            "candidates": candidates,
        })

        remaining = [p for p in remaining if p["patient_id"] != selected["patient_id"]]
        current_time = end_time

    total_scan = sum(row["scan_duration"] for row in schedule)
    final_time = schedule[-1]["end_time"] if schedule else initial_clock
    active_window = max(0, final_time - (schedule_start if schedule_start is not None else initial_clock))
    utilization = (total_scan / active_window * 100.0) if active_window else 0.0
    waits = [row["waiting_time"] for row in schedule]
    emergency_waits = [row["waiting_time"] for row in schedule if row["priority"] == "Emergency"]

    metrics = {
        "patients_scheduled": len(schedule),
        "average_wait": round(float(np.mean(waits)), 2) if waits else 0.0,
        "maximum_wait": max(waits) if waits else 0,
        "emergency_average_wait": round(float(np.mean(emergency_waits)), 2) if emergency_waits else 0.0,
        "total_scan_time": total_scan,
        "idle_time": idle_time,
        "mri_utilization": round(utilization, 2),
        "schedule_start": schedule_start,
        "schedule_end": final_time,
    }
    return schedule, decisions, metrics


@app.route("/")
def index():
    return render_template("index.html")


@app.post("/api/schedule")
def schedule_one():
    try:
        payload = request.get_json(force=True)
        patients = validate_patients(payload.get("patients", []))
        current_time = int(payload.get("current_time", 60))
        if current_time < 0:
            raise ValueError("Current time must be 0 or greater.")
        ranked = rank_waiting_patients(patients, current_time)
        if not ranked:
            return jsonify({"error": "No patient has arrived by the selected current time."}), 400
        state = build_state(ranked)
        q_values = predict_q_values(state)
        action = min(int(np.argmax(q_values)), len(ranked) - 1)
        selected = dict(ranked[action])
        fifo = min(ranked, key=lambda p: (p["arrival_time"], p["patient_id"]))
        priority = max(ranked, key=lambda p: (p["priority_score"], p["waiting_time"], -p["arrival_time"]))
        candidates = []
        for idx, p in enumerate(ranked[:ACTION_SIZE]):
            candidates.append({
                "rank": idx + 1,
                "patient_id": p["patient_id"],
                "priority": p["priority"],
                "waiting_time": p["waiting_time"],
                "scan_duration": p["scan_duration"],
                "q_value": round(float(q_values[idx]), 4),
                "selected": idx == action,
            })
        return jsonify({
            "selected": {**selected, "q_value": round(float(q_values[action]), 4)},
            "explanation": explain(selected),
            "current_time": current_time,
            "candidates": candidates,
            "baselines": {"fifo": fifo["patient_id"], "priority": priority["patient_id"]},
        })
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.post("/api/full_schedule")
def full_schedule():
    try:
        payload = request.get_json(force=True)
        patients = validate_patients(payload.get("patients", []))
        current_time = int(payload.get("current_time", 0))
        if current_time < 0:
            raise ValueError("Current time must be 0 or greater.")
        if not patients:
            raise ValueError("Add at least one patient before generating a schedule.")
        schedule, decisions, metrics = run_full_schedule(patients, current_time)
        return jsonify({"schedule": schedule, "decisions": decisions, "metrics": metrics})
    except (ValueError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.get("/api/results")
def results():
    with open(RESULTS_PATH, newline="", encoding="utf-8") as f:
        return jsonify(list(csv.DictReader(f)))


if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)