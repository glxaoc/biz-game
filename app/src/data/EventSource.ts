// Domain events that drive the office. The scene subscribes and translates each
// event into agent actions. SimulatedSource produces fake events now; LiveSource
// will produce the same events from 1C / Bitrix later — scene code is unchanged.

export type DomainEvent =
  | { type: 'order.new'; id: number; amount: number; managerId?: string }
  | { type: 'client.arrived'; managerId?: string }
  | { type: 'debt.flagged'; amount: number; managerId?: string };

export type EventHandler = (e: DomainEvent) => void;

export interface EventSource {
  start(): void;
  stop(): void;
  on(handler: EventHandler): void;
}

export abstract class BaseEventSource implements EventSource {
  protected handlers: EventHandler[] = [];
  on(handler: EventHandler) {
    this.handlers.push(handler);
  }
  protected emit(e: DomainEvent) {
    for (const h of this.handlers) h(e);
  }
  abstract start(): void;
  abstract stop(): void;
}
