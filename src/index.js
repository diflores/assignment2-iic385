const _ = require('lodash');
import { distinctUntilChanged, filter, map, scan, throttleTime } from 'rxjs/operators';
import {
  combineLatest,
  Observable,
  fromEvent,
  interval,
  merge,
  from,
  zip,
  of,
} from 'rxjs';
const { renderGame, gameSetup } = require('./render');

const BOX_SIZE = [1380, 720];
const ACCELERATION = 2;
const DECELERATION = 1;
const TICKS_MS = 10;
const PLAYER_1_KEY_CODES = [37, 39];
const PLAYER_2_KEY_CODES = [65, 68];

const MOVES = {
  left: (player, speed) => {
    return {
      ...player,
      vX: player.vX - speed,
    };
  },
  right: (player, speed) => {
    return {
      ...player,
      vX: player.vX + speed,
    };
  },
}

const KEYS = {
  left: {
    code: 37,
    handler: MOVES.left,
  },
  right: {
    code: 39,
    handler: MOVES.right,
  },
  a: {
    code: 65,
    handler: MOVES.left,
  },
  d: {
    code: 68,
    handler: MOVES.right,
  },
}

const getKeyCode = (event) => event.keycode || event.which;

const buildPlayersObservable = () => {
  const keydown$ = fromEvent(document, 'keydown').pipe(
    map(getKeyCode),
    map(keyCode => ({ code: keyCode, type: 'down' })),
  );

  const keyup$ = fromEvent(document, 'keyup').pipe(
    map(getKeyCode),
    map(keyCode => ({ code: keyCode, type: 'up' })),
  );

  const keyboard$ = merge(keyup$, keydown$).pipe(scan((prevKeyboard, current) => {
    const keyboard = [...prevKeyboard];

    if (current.type === 'down' && !keyboard.includes(current.code))
      keyboard.push(current.code);
    else if (current.type === 'up') {
      const idx = keyboard.indexOf(current.code);

      if (idx >= 0) keyboard.splice(idx, 1);
    }
    return keyboard;
  }, []))

  const isPlayerKeyCode = keyCode => PLAYER_1_KEY_CODES.includes(keyCode) || PLAYER_2_KEY_CODES.includes(keyCode);

  return keyboard$.pipe(map(keyCodes => keyCodes.filter(isPlayerKeyCode)));
}

const buildCollisionsObservable = () => {
  return Observable.create((observer) => {
    observer.next(null);

    fromEvent(document, 'collision').subscribe((colissionEvent) => {
      observer.next(colissionEvent.detail.player);
      observer.next(null);
    })
  }).pipe(throttleTime(TICKS_MS));
}

const buildTimeObservable = (ms) => {
  return interval(ms);
}

window.onload = () => {
  gameSetup();

  const players$ = buildPlayersObservable();
  const time$ = buildTimeObservable(TICKS_MS);
  const collisions$ = buildCollisionsObservable();

  const state$ = combineLatest(players$, time$, collisions$).pipe(scan(
    (prevState, [keyCodes, time, collisionIdx]) => {
      const collisions = [...prevState.collisions];

      if (typeof collisionIdx !== 'null') {
        collisions[collisionIdx] += 1;
      }

      const accelerate = (players) => {
        const movesPlayer1 = keyCodes.filter(
          (keyCode) => PLAYER_1_KEY_CODES.includes(keyCode),
        ).map(
          (keyCode) => _.find(Object.values(KEYS), (key) => key.code === keyCode).handler,
        );

        const movesPlayer2 = keyCodes.filter(
          (keyCode) => PLAYER_2_KEY_CODES.includes(keyCode),
        ).map(
          (keyCode) => _.find(Object.values(KEYS), (key) => key.code === keyCode).handler,
        );

        return [
          movesPlayer1.reduce(
            (prevPlayer, _function) => _function(prevPlayer, ACCELERATION),
            players[0],
          ),
          movesPlayer2.reduce(
            (prevPlayer, _function) => _function(prevPlayer, ACCELERATION),
            players[1],
          ),
        ];
      };

      const decelerate = (players) => {
        return players.map(p => {
          const decrease = (v, amount) => {
            if (v > 0 && v - amount > 0) return v - amount;
            else if (v > 0 && v - amount <= 0) return 0;
            else if (v < 0 && v + amount < 0) return v + amount;
            else if (v < 0 && v + amount >= 0) return 0;

            return v
          };

          return { ...p, vX: decrease(p.vX, DECELERATION), vY: decrease(p.vY, DECELERATION) }
        })
      };

      const move = (players) => {
        return players.map(p => {
          const newPossibleX = p.x + p.vX
          const newX = 0 <= newPossibleX && newPossibleX <= BOX_SIZE[0] ? newPossibleX : p.x;
          const newPossibleY = p.y + p.vY
          const newY = 0 <= newPossibleY && newPossibleY <= BOX_SIZE[1] ? newPossibleY : p.y;

          return { ...p, x: newX, y: newY };
        })
      }

      // add move to array if players changed position
      const playerOne = prevState.players[0];
      const playerTwo = prevState.players[1];
      const lastPointOfPlayerOne = playerOne[playerOne.length - 1];
      const lastPointOfPlayerTwo = playerTwo[playerTwo.length - 1];
      const newPoints = move(decelerate(accelerate([
        lastPointOfPlayerOne,
        lastPointOfPlayerTwo,
      ])));
      playerOne.push(newPoints[0]);
      playerTwo.push(newPoints[1]);
      /*
      if (newPoints[0].x != lastPointOfPlayerOne.x || newPoints[0].y != lastPointOfPlayerOne.y) {
        playerOne.push(newPoints[0]);
      }
      if (newPoints[1].x != lastPointOfPlayerTwo.x || newPoints[1].y != lastPointOfPlayerTwo.y) {
        playerTwo.push(newPoints[1]);
      }
      */

      return {
        ...prevState,
        collisions,
      };
    },
    {
      players: [
        [{ x: 400, y: 400, vX: 0, vY: 0 }],
        [{ x: 400, y: 400, vX: 0, vY: 0 }],
      ],
      collisions: [0, 0],
    }
  ));

  state$.pipe(distinctUntilChanged(_.isEqual)).subscribe(renderGame)
}
