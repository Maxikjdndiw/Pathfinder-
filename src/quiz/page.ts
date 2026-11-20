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

/* PatternWaves behind the quiz (React Bits, ported). Blue marks print like ink on the white
   page; the fade keeps the middle calm. Without WebGL2 the soft glows stay as the fallback. */
const wavesHost = document.querySelector<HTMLElement>('[data-quiz-waves]');
if (wavesHost) {
  const small = window.matchMedia('(max-width: 640px)').matches;
  import('../components/pattern-waves').then(({ mountPatternWaves }) => {
    const waves = mountPatternWaves(wavesHost, {
      // 'lines' looked calmer than 'silk' on the white page
      preset: 'lines',
      color: '#0066CC',
      backgroundColor: 'transparent',
      fade: 'center',
      fadeSize: 0.55,
      opacity: 0.6,
      // phones: fewer, larger marks
      spacing: small ? 16 : 12,
      interactive: true,
      cursorSize: 50,
      cursorStrength: 0.5,
    });
    if (waves) document.querySelector('.quiz')?.classList.add('has-waves');
  });
}
