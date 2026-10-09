import json
import sqlite3
import threading
from pathlib import Path


class Store:
    """Single-process SQLite snapshots. Writes never cross an await boundary."""

    def __init__(self, path):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.RLock()
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, request_key TEXT UNIQUE, fingerprint TEXT, body TEXT)")
        self.db.commit()

    def create(self, job, key, fingerprint):
        with self.lock, self.db:
            self.db.execute("INSERT INTO jobs VALUES (?, ?, ?, ?)", (job["id"], key, fingerprint, json.dumps(job)))

    def get(self, job_id):
        with self.lock:
            row = self.db.execute("SELECT body FROM jobs WHERE id=?", (job_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def by_key(self, key):
        with self.lock:
            row = self.db.execute("SELECT fingerprint, body FROM jobs WHERE request_key=?", (key,)).fetchone()
            return (row[0], json.loads(row[1])) if row else None

    def all(self):
        with self.lock:
            return [json.loads(row[0]) for row in self.db.execute("SELECT body FROM jobs")]

    def update_hospital(self, job_id, hospital_id, change):
        with self.lock, self.db:
            job = self.get(job_id)
            hospital = next(h for h in job["hospitals"] if h["id"] == hospital_id)
            change(hospital)
            job["status"] = "completed" if all(h["result"] is not None for h in job["hospitals"]) else "running"
            self.db.execute("UPDATE jobs SET body=? WHERE id=?", (json.dumps(job), job_id))
            return job

    def close(self):
        self.db.close()
