# v0 — baseline

## Prompt

```
Build me an API for tasks
```

## Output (Claude, fresh session, 2026-10-11)

Here's a complete, runnable REST API for tasks using **FastAPI** (Python). It supports full CRUD, filtering, validation, and ships with auto-generated docs.

## Setup

```bash
pip install fastapi uvicorn
```

## `main.py`

```python
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, status
from pydantic import BaseModel, Field

app = FastAPI(title="Tasks API", version="1.0.0")


# ---------- Models ----------

class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    status: TaskStatus = TaskStatus.todo
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None


class Task(TaskCreate):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------- In-memory store ----------

tasks: dict[str, Task] = {}


def get_or_404(task_id: str) -> Task:
    task = tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


# ---------- Routes ----------

@app.post("/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate):
    now = datetime.utcnow()
    task = Task(id=str(uuid4()), created_at=now, updated_at=now, **payload.model_dump())
    tasks[task.id] = task
    return task


@app.get("/tasks", response_model=list[Task])
def list_tasks(
    status: Optional[TaskStatus] = None,
    search: Optional[str] = Query(None, description="Case-insensitive title match"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    results = list(tasks.values())
    if status:
        results = [t for t in results if t.status == status]
    if search:
        results = [t for t in results if search.lower() in t.title.lower()]
    results.sort(key=lambda t: t.created_at, reverse=True)
    return results[offset : offset + limit]


@app.get("/tasks/{task_id}", response_model=Task)
def get_task(task_id: str):
    return get_or_404(task_id)


@app.patch("/tasks/{task_id}", response_model=Task)
def update_task(task_id: str, payload: TaskUpdate):
    task = get_or_404(task_id)
    changes = payload.model_dump(exclude_unset=True)
    updated = task.model_copy(update={**changes, "updated_at": datetime.utcnow()})
    tasks[task_id] = updated
    return updated


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str):
    get_or_404(task_id)
    del tasks[task_id]


@app.get("/health")
def health():
    return {"status": "ok", "task_count": len(tasks)}
```

## Run it

```bash
uvicorn main:app --reload
```

Interactive docs are at `http://localhost:8000/docs`.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/tasks` | Create a task |
| `GET` | `/tasks` | List tasks (`?status=`, `?search=`, `?limit=`, `?offset=`) |
| `GET` | `/tasks/{id}` | Get one task |
| `PATCH` | `/tasks/{id}` | Partially update a task |
| `DELETE` | `/tasks/{id}` | Delete a task |
| `GET` | `/health` | Health check |

## Quick test

```bash
# Create
curl -X POST localhost:8000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Write report","due_date":"2026-10-15T17:00:00"}'

# List only in-progress tasks
curl "localhost:8000/tasks?status=in_progress"

# Mark done
curl -X PATCH localhost:8000/tasks/<id> \
  -H "Content-Type: application/json" \
  -d '{"status":"done"}'

# Delete
curl -X DELETE localhost:8000/tasks/<id>
```

## Next steps when you're ready for production

- **Persistence:** swap the `tasks` dict for SQLite/Postgres via SQLAlchemy or SQLModel (same models, minimal changes).
- **Auth:** add a bearer-token dependency and scope tasks to a `user_id`.
- **Containerize:** a 6-line Dockerfile with `uvicorn` as the entrypoint.
- **Tests:** FastAPI's `TestClient` makes each endpoint a 3-line pytest.

If you'd prefer this in Node/Express, Go, or with a database wired in from the start, say which and I'll adapt it.
