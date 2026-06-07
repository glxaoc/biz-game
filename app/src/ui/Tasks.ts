// Owner's daily-tasks panel ("На что обратить внимание сегодня") — right-side
// overlay. Each card can highlight the linked manager in the office and be
// marked done. Driven by OwnerTask[] from data/Briefing.
import type { OwnerTask } from '../data/Briefing';

const PRIO_COLOR: Record<string, string> = { high: '#ff6b6b', med: '#ffb454', low: '#7fd18a' };
const PRIO_LABEL: Record<string, string> = { high: 'Срочно', med: 'Важно', low: 'Можно' };

export class TasksPanel {
  private root: HTMLDivElement;
  private list: HTMLDivElement;
  private countEl: HTMLSpanElement;

  constructor(
    private tasks: OwnerTask[],
    private onShow: (managerIndex: number) => void,
  ) {
    document.getElementById('tasks')?.remove();
    const root = document.createElement('div');
    root.id = 'tasks';
    root.innerHTML = `
      <style>
        #tasks{position:absolute;right:0;top:0;height:100%;width:312px;z-index:60;
          display:flex;flex-direction:column;font-family:'Segoe UI',system-ui,sans-serif;
          background:linear-gradient(180deg,#1c160feb,#15100aeb);
          border-left:1px solid #6b513a;box-shadow:-6px 0 24px #0008;color:#f4efe6}
        #tasks h2{margin:0;padding:14px 16px 6px;font-size:15px;letter-spacing:.3px}
        #tasks .sub{padding:0 16px 10px;color:#c9a06a;font-size:11px}
        #tasks .list{overflow-y:auto;padding:0 12px 16px;display:flex;flex-direction:column;gap:9px}
        #tasks .card{background:#2a2014;border:1px solid #4a3a26;border-radius:11px;padding:10px 12px;
          border-left-width:4px;transition:transform .12s,opacity .25s}
        #tasks .card.done{opacity:.45;filter:grayscale(.6)}
        #tasks .card .top{display:flex;align-items:center;gap:7px;margin-bottom:3px}
        #tasks .card .icon{font-size:15px}
        #tasks .card .ttl{font-size:13px;font-weight:700;line-height:1.2;flex:1}
        #tasks .card .tag{font-size:9px;text-transform:uppercase;letter-spacing:.5px;padding:1px 6px;
          border-radius:6px;color:#15100a;font-weight:700}
        #tasks .card .det{font-size:11.5px;color:#d9cdba;line-height:1.35;margin:3px 0 7px}
        #tasks .card .act{font-size:10.5px;color:#9fd6a0;margin-bottom:8px}
        #tasks .card .act b{color:#c9a06a;font-weight:600}
        #tasks .card .btns{display:flex;gap:7px}
        #tasks .btn{cursor:pointer;border:none;border-radius:7px;padding:5px 10px;font-size:11px;
          font-weight:600;font-family:inherit}
        #tasks .btn.show{background:#3a5a86;color:#eaf2ff}
        #tasks .btn.done{background:#3a4a30;color:#cfe6c4}
        #tasks .btn:hover{filter:brightness(1.15)}
      </style>
      <h2>🗒️ На что обратить внимание</h2>
      <div class="sub">Задачи на сегодня · осталось <span id="tasks-count">0</span></div>
      <div class="list" id="tasks-list"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.list = root.querySelector('#tasks-list')!;
    this.countEl = root.querySelector('#tasks-count')!;
    this.render();
  }

  setTasks(tasks: OwnerTask[]) {
    this.tasks = tasks;
    this.render();
  }

  private render() {
    this.list.innerHTML = '';
    for (const t of this.tasks) this.list.appendChild(this.card(t));
    this.updateCount();
  }

  private card(t: OwnerTask): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'card' + (t.done ? ' done' : '');
    el.style.borderLeftColor = PRIO_COLOR[t.priority];
    const showBtn = t.managerIndex !== undefined ? '<button class="btn show">Показать</button>' : '';
    const src = t.source ? `<span class="tag" style="background:#3f5a36;color:#dff0d6">${t.source}</span>` : '';
    el.innerHTML = `
      <div class="top">
        <span class="icon">${t.icon}</span>
        <span class="ttl">${t.title}</span>
        ${src}
        <span class="tag" style="background:${PRIO_COLOR[t.priority]}">${PRIO_LABEL[t.priority]}</span>
      </div>
      <div class="det">${t.detail}</div>
      <div class="act"><b>→</b> ${t.action}</div>
      <div class="btns">${showBtn}<button class="btn done">${t.done ? 'Вернуть' : 'Готово'}</button></div>`;
    const show = el.querySelector('.btn.show') as HTMLButtonElement | null;
    show?.addEventListener('click', () => t.managerIndex !== undefined && this.onShow(t.managerIndex));
    el.querySelector('.btn.done')!.addEventListener('click', () => {
      t.done = !t.done;
      el.classList.toggle('done', t.done);
      (el.querySelector('.btn.done') as HTMLButtonElement).textContent = t.done ? 'Вернуть' : 'Готово';
      this.updateCount();
    });
    return el;
  }

  private updateCount() {
    this.countEl.textContent = String(this.tasks.filter((t) => !t.done).length);
  }

  destroy() {
    this.root.remove();
  }
}
