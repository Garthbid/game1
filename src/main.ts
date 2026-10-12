import './ui/hud.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

// Exposed for debugging in the browser console
(window as unknown as { __game: Game }).__game = game;
