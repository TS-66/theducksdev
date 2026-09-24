import {
  ChannelClient,
  MessagePortProtocol,
  ProxyChannel,
  type MessagePortLike,
  type MessagePortPayload,
} from "@ducky/rpc";
import {
  IDuckyTaskService,
  type IDuckyTaskService as IDuckyTaskServiceShape,
} from "#src/session/duckyTaskService.js";
import {
  IDuckyAgentService,
  type IDuckyAgentService as IDuckyAgentServiceShape,
} from "#src/ducky-agent/duckyAgent.js";
import {
  IDuckySessionService,
  type IDuckySessionService as IDuckySessionServiceShape,
} from "#src/ducky-session/duckySession.js";
import {
  IModelSelectionService,
  type IModelSelectionService as IModelSelectionServiceShape,
} from "#src/model-provider/providerFacadeServices.js";

interface PortLike {
  on?(event: "message", listener: (event: { data: MessagePortPayload }) => void): void;
  off?(event: "message", listener: (event: { data: MessagePortPayload }) => void): void;
  addEventListener?(
    event: "message",
    listener: (event: { data: MessagePortPayload }) => void,
  ): void;
  removeEventListener?(
    event: "message",
    listener: (event: { data: MessagePortPayload }) => void,
  ): void;
  postMessage(message: MessagePortPayload): void;
  start?(): void;
  close?(): void;
}

function toMessagePortLike(port: PortLike): MessagePortLike {
  return {
    addEventListener(type, listener) {
      if (port.addEventListener) {
        port.addEventListener(type, listener);
        return;
      }
      port.on?.(type, listener);
    },
    removeEventListener(type, listener) {
      if (port.removeEventListener) {
        port.removeEventListener(type, listener);
        return;
      }
      port.off?.(type, listener);
    },
    postMessage(data) {
      port.postMessage(data);
    },
    start() {
      port.start?.();
    },
    close() {
      port.close?.();
    },
  };
}

export interface RemoteBotWorkspaceRuntimeServices {
  duckyAgentService: IDuckyAgentServiceShape;
  duckyTaskService: IDuckyTaskServiceShape;
  duckySessionService: IDuckySessionServiceShape;
  modelSelectionService: IModelSelectionServiceShape;
}

export function createRemoteRuntimeServicesFromPort(
  port: unknown,
): RemoteBotWorkspaceRuntimeServices {
  const protocol = new MessagePortProtocol(toMessagePortLike(port as PortLike));
  const client = new ChannelClient(protocol);
  return {
    duckyAgentService: ProxyChannel.toService<IDuckyAgentServiceShape>(
      client.getChannel(IDuckyAgentService.channelName),
    ),
    duckyTaskService: ProxyChannel.toService<IDuckyTaskServiceShape>(
      client.getChannel(IDuckyTaskService.channelName),
    ),
    duckySessionService: ProxyChannel.toService<IDuckySessionServiceShape>(
      client.getChannel(IDuckySessionService.channelName),
    ),
    modelSelectionService: ProxyChannel.toService<IModelSelectionServiceShape>(
      client.getChannel(IModelSelectionService.channelName),
    ),
  };
}
