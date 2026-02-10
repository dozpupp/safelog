# Automated Test Suite — Walkthrough

## What was built

A comprehensive automated test suite for the Safelog application, covering **65 tests** across backend and frontend.

---

## Backend Tests (pytest) — 58 tests

### Infrastructure ([conftest.py](file:///home/bakaneko/safelog/backend/tests/conftest.py))

| Decision | Rationale |
|---|---|
| In-memory SQLite with `StaticPool` | Fast, no file locking, fully isolated per test |
| PQC service fully mocked | Tests run without Node.js sidecar |
| Rate limiter reset per test | Prevents `slowapi` limits from cross-test accumulation |
| `user1`/`user2` fixtures | Reusable authenticated test users with helper functions |

### Test Modules

| Module | Tests | Covers |
|---|---|---|
| [test_auth.py](file:///home/bakaneko/safelog/backend/tests/test_auth.py) | 10 | Nonce generation, login flow, anti-replay, key update |
| [test_users.py](file:///home/bakaneko/safelog/backend/tests/test_users.py) | 9 | CRUD, authorization, search, resolve |
| [test_secrets.py](file:///home/bakaneko/safelog/backend/tests/test_secrets.py) | 19 | CRUD, sharing, revoking grants, access control, documents |
| [test_messenger.py](file:///home/bakaneko/safelog/backend/tests/test_messenger.py) | 10 | Send, history, pagination, conversations, mark-read |
| [test_multisig.py](file:///home/bakaneko/safelog/backend/tests/test_multisig.py) | 10 | Workflow creation, signing, multi-signer completion |

### Run command
```bash
cd backend && source ../.venv/bin/activate && python3 -m pytest tests/ -v
```

---

## Frontend Tests (vitest) — 7 tests

### Configuration
- Vitest configured in [vite.config.js](file:///home/bakaneko/safelog/frontend/vite.config.js) with `jsdom` environment
- Setup file loads `@testing-library/jest-dom` matchers

### Test Modules

| Module | Tests | Covers |
|---|---|---|
| [AuthContext.test.jsx](file:///home/bakaneko/safelog/frontend/src/test/AuthContext.test.jsx) | 5 | Login/logout state transitions, updateUser, provider error boundary |
| [App.test.jsx](file:///home/bakaneko/safelog/frontend/src/test/App.test.jsx) | 2 | Provider nesting, conditional login rendering |

### Run command
```bash
cd frontend && npx vitest run
```

---

## Validation Results

```
Backend:  58 passed in 2.45s
Frontend:  7 passed in 0.87s
Total:    65 passed, 0 failed
```

### Dependencies added
- **Backend**: `pytest`, `httpx` (<0.28 for starlette compat), `pytest-asyncio`
- **Frontend**: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
