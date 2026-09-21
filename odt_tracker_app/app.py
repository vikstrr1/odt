from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import os
from typing import Optional, Any

from fastapi import FastAPI, HTTPException, Request, Header, Depends
import socketio
import firebase_admin
from firebase_admin import auth as fb_auth
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from database import add_drink, add_participant, get_current_game_id, get_rankings, get_summary, get_team_standings, get_timeline, init_db, list_games, reset_game, set_current_game_id

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title='ÖDT Tracker', version='1.0.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.mount('/assets', StaticFiles(directory=str(BASE_DIR / 'static' / 'frontend' / 'assets')), name='assets')

# --- Socket.IO server (ASGI) ---
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)

# --- Auth: verify Google ID tokens (Firebase Auth) ---
ADMIN_EMAILS = [e.strip() for e in os.environ.get('ADMIN_EMAILS', '').split(',') if e.strip()]
ALLOW_LOCAL_AUTH = os.environ.get('ALLOW_LOCAL_AUTH', 'true').lower() in {'1', 'true', 'yes', 'on'}

if not firebase_admin._apps:
    firebase_admin.initialize_app()


def _verify_firebase_token(token: str) -> dict:
    decoded = fb_auth.verify_id_token(token)
    return {
        'sub': decoded.get('uid', ''),
        'email': decoded.get('email', ''),
        'name': decoded.get('name', ''),
    }


async def require_auth(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        if ALLOW_LOCAL_AUTH:
            return {'sub': 'local-dev', 'email': 'local-dev@localhost'}
        raise HTTPException(status_code=401, detail='Missing authorization header')
    if not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Invalid authorization header')
    token = authorization.split(' ', 1)[1]
    try:
        return _verify_firebase_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail='Invalid Google ID token')


async def require_admin(authorization: Optional[str] = Header(None)) -> dict:
    user = await require_auth(authorization)
    email = user.get('email', '')
    if ADMIN_EMAILS and email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail='Admin access required')
    return user


# --- Helper: Ensure JSON Serializable ---
# This forces SQLite rows or dict-like objects into pure Python dicts/types
def sanitize_for_socket(data: Any) -> Any:
    # A fast, bulletproof way to strip out non-serializable objects (like sqlite3.Row)
    # by bouncing the data through the standard JSON parser.
    return json.loads(json.dumps(data, default=str))


@app.on_event('startup')
def startup() -> None:
    init_db()


@app.get('/', response_class=HTMLResponse)
async def index():
    react_index = BASE_DIR / 'static' / 'frontend' / 'index.html'
    if react_index.exists():
        return HTMLResponse(
            content=react_index.read_text(),
            headers={'Cache-Control': 'no-cache, no-store, must-revalidate'},
        )
    return HTMLResponse(content='<h1>ÖDT Tracker</h1><p>Frontend not built.</p>', status_code=500)


@app.get('/api/health')
async def health():
    return {'status': 'ok'}


@app.get('/api/summary')
async def summary():
    return {'status': 'ok', 'summary': get_summary(), 'participants': get_rankings(), 'team_standings': get_team_standings(), 'timeline': get_timeline()}


@app.get('/api/participants')
async def participants():
    return get_rankings()


@app.get('/api/teams')
async def teams():
    return get_team_standings()


@app.get('/api/timeline')
async def timeline():
    return get_timeline()


@app.post('/api/participants')
async def create_participant(payload: dict, _auth=Depends(require_admin)):
    name = str(payload.get('name', '')).strip()
    team_name = str(payload.get('team_name', '')).strip() or 'Team 1'
    weight_kg = float(payload.get('weight_kg', 0.0) or 0.0)
    arrival_time = payload.get('arrival_time') or datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S')

    if not name:
        raise HTTPException(status_code=400, detail='Participant name is required.')
    if weight_kg <= 0:
        raise HTTPException(status_code=400, detail='Weight must be greater than zero.')

    try:
        participant = add_participant(name=name, team_name=team_name, weight_kg=weight_kg, arrival_time=arrival_time)
        
        # Fixed Socket Emission
        try:
            safe_payload = sanitize_for_socket({'participant': participant, 'summary': get_summary()})
            await sio.emit('participant_created', safe_payload)
        except Exception as e:
            print(f"Socket emit failed on participant_created: {e}")
            
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
        
    return {'status': 'ok', 'participant': participant}


@app.post('/api/drinks')
async def create_drink(payload: dict, _auth=Depends(require_admin)):
    name = str(payload.get('participant_name', '')).strip()
    beverage = str(payload.get('beverage', '')).strip()
    volume_ml = float(payload.get('volume_ml', 0.0) or 0.0)
    abv_percent = float(payload.get('abv_percent', 0.0) or 0.0)
    timestamp = payload.get('timestamp')

    if not name or not beverage:
        raise HTTPException(status_code=400, detail='Participant name and beverage are required.')
    if volume_ml <= 0:
        raise HTTPException(status_code=400, detail='Volume must be > 0.')

    try:
        drink = add_drink(participant_name=name, beverage=beverage, volume_ml=volume_ml, abv_percent=abv_percent, timestamp=timestamp)
        
        # Fixed Socket Emission
        try:
            safe_payload = sanitize_for_socket({'drink': drink, 'summary': get_summary()})
            await sio.emit('drink_logged', safe_payload)
        except Exception as e:
             print(f"Socket emit failed on drink_logged: {e}")
             
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
        
    return {'status': 'ok', 'drink': drink}


@app.post('/api/reset')
async def reset(_auth=Depends(require_admin)):
    reset_game()
    try:
        safe_payload = sanitize_for_socket({'summary': get_summary()})
        await sio.emit('game_reset', safe_payload)
    except Exception as e:
         print(f"Socket emit failed on game_reset: {e}")
    return {'status': 'ok'}


@app.post('/api/game/reset')
async def reset_tracker_game(_auth=Depends(require_admin)):
    reset_game()
    try:
        safe_payload = sanitize_for_socket({'summary': get_summary()})
        await sio.emit('game_reset', safe_payload)
    except Exception as e:
        print(f"Socket emit failed on game_reset: {e}")
    return {'status': 'ok', 'message': 'New game started.'}


@app.get('/api/game/current')
async def current_game():
    return {'game_id': get_current_game_id()}


@app.get('/api/games')
async def games():
    return list_games()


@app.post('/api/game/select')
async def select_game(payload: dict, _auth=Depends(require_admin)):
    game_id = int(payload.get('game_id', 0) or 0)
    if game_id <= 0:
        raise HTTPException(status_code=400, detail='A valid game id is required.')
    try:
        set_current_game_id(game_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
        
    try:
        safe_payload = sanitize_for_socket({'game_id': game_id, 'summary': get_summary()})
        await sio.emit('game_selected', safe_payload)
    except Exception as e:
        print(f"Socket emit failed on game_selected: {e}")
        
    return {'status': 'ok', 'game_id': game_id}


@app.get('/api/games/current')
async def current_game():
    game_id = get_current_game_id()
    if game_id is None:
        raise HTTPException(status_code=404, detail='No current game found.')
    return {'status': 'ok', 'game_id': game_id}


if __name__ == '__main__':
    import os
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)