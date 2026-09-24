import type { Event, IDisposable } from "@ducky/rpc";
import type { DuckyProtocolMessage } from "@ducky/shared";

export type DuckyProtocolTransportKind = "stdio" | "websocket" | "memory";

export interface DuckyProtocolTransportClosedEvent {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  reason?: string;
}

export interface DuckyProtocolTransport extends IDisposable {
  readonly kind: DuckyProtocolTransportKind;
  readonly onMessage: Event<DuckyProtocolMessage>;
  readonly onClose: Event<DuckyProtocolTransportClosedEvent>;
  send(message: DuckyProtocolMessage): Promise<void>;
  disposeAndWait?(): Promise<void>;
}
