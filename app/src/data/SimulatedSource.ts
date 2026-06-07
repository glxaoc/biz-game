import { BaseEventSource } from './EventSource';

// Generates plausible fake business activity on timers. Swappable with LiveSource.
export class SimulatedSource extends BaseEventSource {
  private timers: number[] = [];
  private orderId = 4470;

  start() {
    // a new order every ~8–15s — staff stay seated/working most of the time,
    // only one manager gets up to fetch now and then.
    this.timers.push(
      window.setInterval(() => {
        this.orderId++;
        this.emit({ type: 'order.new', id: this.orderId, amount: rndInt(3, 28) * 1000 });
      }, rndInt(8000, 15000)),
    );
    // a walk-in client every ~12–20s
    this.timers.push(
      window.setInterval(() => {
        this.emit({ type: 'client.arrived' });
      }, rndInt(12000, 20000)),
    );
    // an occasional debt flag
    this.timers.push(
      window.setInterval(() => {
        if (Math.random() < 0.5) this.emit({ type: 'debt.flagged', amount: rndInt(20, 90) * 1000 });
      }, 15000),
    );
  }

  stop() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
  }
}

function rndInt(a: number, b: number) {
  return Math.floor(a + Math.random() * (b - a));
}
