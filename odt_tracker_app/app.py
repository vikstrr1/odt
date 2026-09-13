from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
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


@app.on_event('startup')
def startup() -> None:
    init_db()


@app.get('/', response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, 'index.html', {})


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
async def create_participant(payload: dict):
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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'status': 'ok', 'participant': participant}


@app.post('/api/drinks')
async def create_drink(payload: dict):
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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'status': 'ok', 'drink': drink}


@app.post('/api/reset')
async def reset():
    reset_game()
    return {'status': 'ok'}


@app.post('/api/game/reset')
async def reset_tracker_game():
    reset_game()
    return {'status': 'ok', 'message': 'New game started.'}


@app.get('/api/game/current')
async def current_game():
    return {'game_id': get_current_game_id()}


@app.get('/api/games')
async def games():
    return list_games()


@app.post('/api/game/select')
async def select_game(payload: dict):
    game_id = int(payload.get('game_id', 0) or 0)
    if game_id <= 0:
        raise HTTPException(status_code=400, detail='A valid game id is required.')
    try:
        set_current_game_id(game_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {'status': 'ok', 'game_id': game_id}


@app.get('/api/games/current')
async def current_game():
    game_id = get_current_game_id()
    if game_id is None:
        raise HTTPException(status_code=404, detail='No current game found.')
    return {'status': 'ok', 'game_id': game_id}


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('app:app', host='0.0.0.0', port=8080, reload=True)
