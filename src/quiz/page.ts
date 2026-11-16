/** Entry for /quiz (quiz.html) */
import '../styles/index.css';
import './quiz.css';
import { initNavWave, initShine, initSignupLinks } from '../common';
import { QuizApp } from './ui';

initSignupLinks();
initNavWave();
initShine();

const stage = document.getElementById('quiz-app');
if (stage) new QuizApp(stage);
