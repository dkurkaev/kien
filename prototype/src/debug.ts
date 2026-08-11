import GUI from 'lil-gui';
import { config } from './config';

// Everything worth cranking lives in one panel (toggle with G). The whole point
// of the prototype is to feel the numbers, not to admire them.
export class Debug {
  private gui: GUI;
  private stats = { муравьи: 0, пятна: 0, fps: 0 };

  constructor() {
    this.gui = new GUI({ title: 'Тюнинг' });

    const s = this.gui.addFolder('Статистика');
    s.add(this.stats, 'муравьи').listen().disable();
    s.add(this.stats, 'пятна').listen().disable();
    s.add(this.stats, 'fps').listen().disable();

    const ph = this.gui.addFolder('Феромон');
    ph.add(config.pheromone, 'evaporation', 0, 2, 0.01).name('испарение');
    ph.add(config.pheromone, 'diffusion', 0, 0.5, 0.01).name('диффузия');
    ph.add(config.pheromone, 'antDeposit', 0, 20, 0.5).name('вклад муравья');
    ph.add(config.pheromone, 'foodStrength', 0, 200, 1).name('сила еды');

    const a = this.gui.addFolder('Муравьи');
    a.add(config.ants, 'target', 0, 500, 10).name('лимит популяции');
    a.add(config.ants, 'maxInfluxRate', 0, 20, 0.5).name('макс приток /сек');
    a.add(config.ants, 'influxPerFood', 0, 6, 0.1).name('приток / еда');
    a.add(config.ants, 'speed', 0, 4, 0.05).name('скорость');
    a.add(config.ants, 'noise', 0, 2, 0.02).name('шум');
    a.add(config.ants, 'sensorDist', 0.5, 8, 0.1).name('антенны, дист');
    a.add(config.ants, 'sensorAngle', 0.1, 1.5, 0.02).name('антенны, угол');

    const m = this.gui.addFolder('Пятна');
    m.add(config.mess, 'spawnInterval', 0.5, 10, 0.1).name('интервал');
    m.add(config.mess, 'spillShare', 0, 1, 0.05).name('доля пятен');
    m.add(config.mess, 'spillMinRadius', 0.1, 1.5, 0.05).name('мин радиус');
    m.add(config.mess, 'spillMaxRadius', 0.1, 1.5, 0.05).name('макс радиус');
    m.add(config.mess, 'spillAmount', 0.3, 1.6, 0.05).name('насыщенность');

    const cr = this.gui.addFolder('Крошки');
    cr.add(config.mess, 'crumbMinCount', 1, 80, 1).name('мин кол-во');
    cr.add(config.mess, 'crumbMaxCount', 1, 120, 1).name('макс кол-во');
    cr.add(config.mess, 'crumbSpread', 0.1, 2, 0.05).name('разброс');
    cr.add(config.mess, 'crumbSize', 0.02, 0.2, 0.005).name('размер');
    cr.add(config.mess, 'crumbFriction', 1, 20, 0.5).name('трение');
    cr.add(config.mess, 'crumbPush', 2, 30, 0.5).name('макс сила флика');
    cr.add(config.mess, 'crumbFan', 0, 2, 0.05).name('боковой разлёт');
    cr.add(config.mess, 'crumbGravity', 1, 25, 0.5).name('гравитация');

    const sw = this.gui.addFolder('Мазок');
    sw.add(config.swipe, 'width', 0.1, 1.5, 0.05).name('ширина');
    sw.add(config.swipe, 'fastThreshold', 1, 15, 0.1).name('порог быстро');
    sw.add(config.swipe, 'cleanPerSec', 0.2, 8, 0.1).name('сила очистки');
    sw.add(config.swipe, 'smearSpawn', 0, 5, 1).name('размаз → крошек');
    sw.add(config.swipe, 'pushDist', 0, 3, 0.05).name('толчок веником');

    const sp = this.gui.addFolder('Спрей');
    sp.add(config.spray, 'range', 0.5, 5, 0.1).name('радиус');
    sp.add(config.spray, 'killProb', 0, 1, 0.05).name('сила поражения');
    sp.add(config.spray, 'noFoodTime', 0, 60, 1).name('время возврата');

    this.gui.folders.forEach((f) => f.close());
    this.gui.domElement.style.display = 'none';
  }

  toggle(): void {
    const el = this.gui.domElement;
    el.style.display = el.style.display === 'none' ? '' : 'none';
  }

  setStats(ants: number, messes: number, fps: number): void {
    this.stats.муравьи = ants;
    this.stats.пятна = messes;
    this.stats.fps = Math.round(fps);
  }
}
