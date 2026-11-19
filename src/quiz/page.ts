/** Entry for /quiz (quiz.html) */
import '../styles/index.css';
import './quiz.css';
import { initNavGlass, initNavWave, initSignupLinks } from '../common';
import { QuizApp } from './ui';

initSignupLinks();
initNavGlass();
initNavWave();

const stage = document.getElementById('quiz-app');
if (stage) new QuizApp(stage);
