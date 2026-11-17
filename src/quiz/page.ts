/** Entry for /quiz (quiz.html) */
import '../styles/index.css';
import './quiz.css';
import { initNavGlass, initNavWave, initShine, initSignupLinks } from '../common';
import { QuizApp } from './ui';

initSignupLinks();
initNavGlass();
initNavWave();
initShine();

const stage = document.getElementById('quiz-app');
if (stage) new QuizApp(stage);
