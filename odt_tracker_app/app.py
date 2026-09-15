from __future__ import annotations

from datetime import datetime
from pathlib import Path

import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Depends, Header
from jose import JWTError, jwt
import socketio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

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
app.mount('/static', StaticFiles(directory=str(BASE_DIR / 'static')), name='static')
templates = Jinja2Templates(directory=str(BASE_DIR / 'templates'))

# --- Socket.IO server (ASGI) ---
# create an Async server and wrap the FastAPI app with the Socket.IO ASGI app
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)

# --- Simple JWT-based admin auth ---
SECRET_KEY = os.environ.get('JWT_SECRET', 'please-set-a-long-secret')
ALGORITHM = 'HS256'
ADMIN_USER = os.environ.get('ADMIN_USER', 'admin')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'password')

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token

async def require_auth(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail='Missing authorization header')
    if not authorization.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='Invalid authorization header')
    token = authorization.split(' ', 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get('sub')
        if username != ADMIN_USER:
            raise HTTPException(status_code=401, detail='Invalid token subject')
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail='Invalid token')


@app.on_event('startup')
def startup() -> None:
    init_db()


@app.get('/', response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, 'index.html', {})


@app.get('/api/health')
async def health():
    return {'status': 'ok'}


@app.post('/api/login')
async def login(payload: dict):
    username = str(payload.get('username', ''))
    password = str(payload.get('password', ''))
    if username == ADMIN_USER and password == ADMIN_PASSWORD:
        token = create_access_token({'sub': username})
        return {'status': 'ok', 'access_token': token}
    raise HTTPException(status_code=401, detail='Invalid credentials')


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
async def create_participant(payload: dict, _auth=Depends(require_auth)):
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
        # broadcast update to websocket clients
        try:
            await sio.emit('participant_created', {'participant': participant, 'summary': get_summary()})
        except Exception:
            pass
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'status': 'ok', 'participant': participant}


@app.post('/api/drinks')
async def create_drink(payload: dict, _auth=Depends(require_auth)):
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
        try:
            await sio.emit('drink_logged', {'drink': drink, 'summary': get_summary()})
        except Exception:
            pass
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'status': 'ok', 'drink': drink}


@app.post('/api/reset')
async def reset(_auth=Depends(require_auth)):
    reset_game()
    try:
        await sio.emit('game_reset', {'summary': get_summary()})
    except Exception:
        pass
    return {'status': 'ok'}


@app.post('/api/game/reset')
async def reset_tracker_game(_auth=Depends(require_auth)):
    reset_game()
    try:
        await sio.emit('game_reset', {'summary': get_summary()})
    except Exception:
        pass
    return {'status': 'ok', 'message': 'New game started.'}


@app.get('/api/game/current')
async def current_game():
    return {'game_id': get_current_game_id()}


@app.get('/api/games')
async def games():
    return list_games()


@app.post('/api/game/select')
async def select_game(payload: dict, _auth=Depends(require_auth)):
    game_id = int(payload.get('game_id', 0) or 0)
    if game_id <= 0:
        raise HTTPException(status_code=400, detail='A valid game id is required.')
    try:
        set_current_game_id(game_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        await sio.emit('game_selected', {'game_id': game_id, 'summary': get_summary()})
    except Exception:
        pass
    return {'status': 'ok', 'game_id': game_id}


@app.get('/api/games/current')
async def current_game():
    game_id = get_current_game_id()
    if game_id is None:
        raise HTTPException(status_code=404, detail='No current game found.')
    return {'status': 'ok', 'game_id': game_id}


if __name__ == '__main__':
    import uvicorn

    # When running directly, serve the combined Socket.IO + FastAPI ASGI app
    uvicorn.run('app:sio_app', host='0.0.0.0', port=8080, reload=True)
