/** Entry for /quiz (quiz.html) */
import '../styles/index.css';
import './quiz.css';
import { initNavWave, initShine, initSignupLinks } from '../common';
import { initSvgLiquidGlass } from '../liquidGlass';
import { QuizApp } from './ui';

initSignupLinks();
initNavWave();
initShine();
const nav = document.querySelector<HTMLElement>('.nav');
if (nav) initSvgLiquidGlass([nav]);

const stage = document.getElementById('quiz-app');
if (stage) new QuizApp(stage);
