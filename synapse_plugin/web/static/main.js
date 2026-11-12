// Entry point: lazy page modules, the mode label, a subtle drifting point-cloud background, then the router.
import { $, app, isStatic, lazy, route, start } from './core.js';

const PAGES = { 'home.js': ['home'], 'analyse.js': ['analyse'], 'simulate_page.js': ['simulate'], 'docs.js': ['method', 'about'] };
lazy(Object.fromEntries(Object.entries(PAGES).flatMap(([file, names]) => names.map(n => [n, () => import('./' + file)]))));
route('notfound', () => { app().innerHTML = '<h1>Not found</h1><p><a href="#/">Back to the start</a></p>'; });

$('#mode').textContent = isStatic()
  ? 'static site: the analysis runs in your browser (JS port tested against the Python code); files are not uploaded'
  : 'local app: analysis in the browser, Python cross-check on this computer';

// Background: two faint clusters of dots (red and green) drifting slowly. Off under prefers-reduced-motion.
function background(canvas) {
  if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = canvas.getContext('2d');
  const fit = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  fit(); addEventListener('resize', fit);
  const dots = Array.from({ length: 90 }, (_, i) => {
    const c = i % 2, cx = c ? 0.68 : 0.3, cy = c ? 0.62 : 0.38, a = Math.random() * 6.28, r = Math.random() * 0.12;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: (Math.random() - 0.5) * 2e-4, vy: (Math.random() - 0.5) * 2e-4, c };
  });
  let last = 0;
  const tick = t => {
    requestAnimationFrame(tick);
    if (document.hidden || t - last < 50) return;
    last = t;
    g.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > 1) d.vx *= -1;
      if (d.y < 0 || d.y > 1) d.vy *= -1;
      g.fillStyle = d.c ? 'rgba(61,255,143,.55)' : 'rgba(255,79,109,.55)';
      g.beginPath(); g.arc(d.x * canvas.width, d.y * canvas.height, 1.6, 0, 6.29); g.fill();
    }
  };
  requestAnimationFrame(tick);
}
background($('#bg'));
start();
