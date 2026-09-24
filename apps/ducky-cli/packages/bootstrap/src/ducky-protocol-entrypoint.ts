import { createConfig } from "@ducky/adapters/config";
import { createNodeModelSelectionFacade } from "@ducky/provider-node";
import { createNodeLoggerFactory } from "@ducky/adapters/logging";
import {
  createMcpAdapterConnectionPool,
  createMcpTelemetryTracker,
  type McpConnectionPool,
  type McpTelemetryTracker,
} from "@ducky/adapters/mcp";
import {
  duckyProtocolNotifications,
  type DuckyMcpResourceSample,
  type DuckyMcpTelemetryEvent,
} from "@ducky/shared";
import type { SqliteSessionStore } from "@ducky/adapters/storage";
import { traceContextToLogContext, createRootTraceContext } from "@ducky/contracts";
import type { McpPort, ModelSelection } from "@ducky/contracts";
import type { PresentationSurface } from "@ducky/core";
import type { RunDuckyProtocolAgentOptions, DuckyAppOptions } from "./app/types.js";
import { createDuckyApp } from "./app/create-app.js";
import {
  createNodeReplBrowserBroker,
  type NodeReplBrowserBroker,
} from "./app/node-repl-browser-broker.js";
import {
  openProtocolStartupStorage,
  prepareProtocolStartupStorage,
} from "./ducky-protocol/storage-startup.js";
import { closeSessionStore, getSessionDbPath } from "./app/session-store.js";
import { startProcessProviderRegistryRuntime } from "./app/process-provider-registry-runtime.js";
import { scheduleStartupLogRetentionCleanup } from "./log-retention.js";
import { StartupTimer, startupNow } from "./startup-logging.js";
import { installDuckyProtocolAiSdkWarningLogger } from "./ducky-protocol/ai-sdk-warning-logger.js";
import {
  createOfficialMcpAuthHeadersPort,
  type OfficialMcpAuthRequestContext,
} from "./ducky-protocol/official-mcp-auth-port.js";
import {
  createOfficialMcpTrustedOriginRegistry,
  OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV,
  DUCKY_WORKSPACE_IDENTITY_ENV,
  resolveRuntimeDuckyEndpointOrigin,
} from "@ducky/shared";
import { DuckyProtocolAgentServer } from "./ducky-protocol/server.js";
import { DuckyProtocolNdjsonConnection } from "./ducky-protocol/transport.js";
import { cleanupProtocolRuntime } from "./ducky-protocol/runtime-cleanup.js";
import { startProtocolResourceSampler } from "./ducky-protocol/resource-sampler.js";
import { acquireProtocolStartupResource } from "./ducky-protocol/startup-resource.js";
import type { DuckyProcessResourceSampler } from "./process-resource-sampler.js";
import { prepareDuckyTelemetryEnv, shutdownDuckyTelemetry } from "./telemetry-bootstrap.js";

function applyProtocolPresentationSurface(
  options: Omit<DuckyAppOptions, "providerRegistry">,
  presentationSurface: PresentationSurface,
): Omit<DuckyAppOptions, "providerRegistry"> {
  return {
    ...options,
    runtimeConfig: {
      ...options.runtimeConfig,
      presentationSurface,
    },
  };
}

/**
 * 进程级 Registry 已就绪后，它就是当前 Environment 的模型事实源。
 *
 * 旧 workspace snapshot 不再参与 Provider 和 Model 执行。
 */
function applyProtocolProviderRegistry(
  options: Omit<DuckyAppOptions, "providerRegistry">,
  providerRegistry: DuckyAppOptions["providerRegistry"],
  configuredDefaultModelSelection?: ModelSelection,
): DuckyAppOptions {
  return {
    ...options,
    providerRegistry,
    ...(configuredDefaultModelSelection ? { configuredDefaultModelSelection } : {}),
  };
}

export async function runDuckyProtocolAgent(
  options: RunDuckyProtocolAgentOptions = {},
): Promise<void> {
  if (options.prepareStorageOnly) {
    const config = createConfig({ env: options.env });
    await prepareProtocolStartupStorage({
      dbPath: getSessionDbPath(config, options.cwd),
      input: options.input ?? process.stdin,
      output: options.output ?? process.stdout,
    });
    return;
  }
  const startupStartedAt = startupNow();
  const presentationSurface = options.presentationSurface ?? "terminal";
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const loggerFactory = createNodeLoggerFactory({ env: options.env });
  const traceContext = createRootTraceContext({
    attributes: {
      entrypoint: "ducky_protocol",
    },
  });
  const logger = loggerFactory.createLogger("ducky").child({
    ...traceContextToLogContext(traceContext),
    module: "bootstrap.ducky_protocol",
  });
  installDuckyProtocolAiSdkWarningLogger(logger);
  const startupTimer = new StartupTimer(
    logger,
    {
      ...traceContextToLogContext(traceContext),
      module: "bootstrap.ducky_protocol",
      startupKind: "ducky_protocol_agent",
    },
    startupStartedAt,
  );
  startupTimer.start("Ducky Protocol agent startup started", {
    context: { version: options.version },
    event: "ducky_protocol.startup.started",
    stage: "start",
  });

  let sessionStore: SqliteSessionStore | undefined;
  let serverForCleanup: DuckyProtocolAgentServer | undefined;
  let nodeReplBrowserBroker: NodeReplBrowserBroker | undefined;
  let mcpConnectionPool: McpConnectionPool | undefined;
  let mcpPort: McpPort | undefined;
  let mcpTelemetryTracker: McpTelemetryTracker | undefined;
  let mcpResourceSink: ((samples: DuckyMcpResourceSample[]) => void) | undefined;
  let mcpTelemetrySink: ((event: DuckyMcpTelemetryEvent) => void) | undefined;
  let processResourceSampler: DuckyProcessResourceSampler | undefined;
  let providerRegistryRuntime:
    | Awaited<ReturnType<typeof startProcessProviderRegistryRuntime>>
    | undefined;
  try {
    // 数据库准备先于账号、Registry 和遥测，不把远端材料等待混进迁移门禁。
    const configResult = createConfig({ env: options.env });
    sessionStore = await acquireProtocolStartupResource({
      signal: options.lifecycle?.signal,
      logger,
      disposeLate: (store) => closeSessionStore(store),
      create: () =>
        openProtocolStartupStorage({
          dbPath: getSessionDbPath(configResult),
          output,
          onProgress: (progress) =>
            logger.info("SQLite startup state", {
              event: "ducky_protocol.startup.storage_state",
              ...progress,
            }),
        }),
    });
    const runtimeEnv = options.env ?? process.env;
    options.lifecycle?.signal.throwIfAborted();
    providerRegistryRuntime = await acquireProtocolStartupResource({
      signal: options.lifecycle?.signal,
      logger,
      create: () => startProcessProviderRegistryRuntime(runtimeEnv),
      disposeLate: (runtime) => runtime.dispose(),
    });
    options.lifecycle?.signal.throwIfAborted();
    logger.info("Worker Provider Registry 已就绪", {
      accountRevision: providerRegistryRuntime.snapshot.sourceRevisions.account,
      configRevision: providerRegistryRuntime.snapshot.sourceRevisions.config,
      event: "ducky_protocol.provider_registry.ready",
      module: "bootstrap.ducky_protocol",
      providerCount: providerRegistryRuntime.snapshot.registry.providers.length,
    });
    const runtimeSurface = resolveProtocolRuntimeSurface(runtimeEnv);
    const telemetryEnv = await acquireProtocolStartupResource({
      signal: options.lifecycle?.signal,
      logger,
      disposeLate: () => shutdownDuckyTelemetry(),
      create: () =>
        prepareDuckyTelemetryEnv(runtimeEnv, {
          cliVersion: options.version,
          productVersion: options.env?.DUCKY_APP_VERSION,
          runtimeSurface,
        }),
    });
    const telemetryDeviceMid = telemetryEnv.DUCKY_TELEMETRY_DEVICE_MID;
    mcpTelemetryTracker =
      configResult.config.features.mcp === false
        ? undefined
        : createMcpTelemetryTracker({
            idSalt: traceContext.traceId,
            onEvent: (event) => mcpTelemetrySink?.(event),
            onResourceSamples: (samples) => mcpResourceSink?.(samples),
          });
    // 官方 MCP 身份头端口：连接池构造早于 server，故用惰性 holder 回填。
    // server 就绪前该端口返回 official_auth_unavailable；HTTP tools/call 会匿名交给服务端
    // 返回结构化权限错误，stdio 则把 reason 下发给插件。连接与工具发现都不受影响。
    let officialMcpAuthContext: OfficialMcpAuthRequestContext | undefined;
    // stdio 官方 MCP 没有 url 可供校验，targetOrigin 只能由宿主给出。
    // 与下面 trustedOrigins 的 resolveDuckyApiOrigin 必须是同一个表达式，否则两侧判定分叉。
    const resolveDuckyApiOrigin = (): string =>
      resolveRuntimeDuckyEndpointOrigin(options.env ?? process.env);
    const workspaceIdentity = (options.env ?? process.env)[DUCKY_WORKSPACE_IDENTITY_ENV]?.trim();
    const officialMcpAuth = {
      authHeadersPort: createOfficialMcpAuthHeadersPort({
        resolveContext: () => officialMcpAuthContext,
        // workspaceKey 必须遵守仓库约定 `workspaceIdentity?.trim() || workspacePath`，
        // 否则同路径不同 identity 的远端 workspace 在审计上下文里无法区分。
        // 注意：agent 进程当前没有 identity 来源，因此实际多为 undefined，key 退化为 path；
        // 详见 official-mcp-auth-port.ts 的"剩余缺口"说明。
        resolveWorkspace: ({ workspaceIdentity, workspacePath }) => {
          const path = workspacePath ?? options.cwd;
          if (!path) return undefined;
          const identity = workspaceIdentity?.trim();
          return {
            ...(identity ? { workspaceIdentity: identity } : {}),
            workspaceKey: identity || path,
            workspacePath: path,
          };
        },
      }),
      resolveDuckyApiOrigin,
      ...(workspaceIdentity ? { workspaceIdentity } : {}),
      // 信任判定只看一条：目标 origin 等于当前 Ducky API origin（https）。pluginId 不参与。
      // origin 运行时解析（跟随 production/test 与自建环境），不硬编码域名。
      trustedOrigins: createOfficialMcpTrustedOriginRegistry({
        devTrustedOriginsRaw: (options.env ?? process.env)[OFFICIAL_MCP_DEV_TRUSTED_ORIGINS_ENV],
        resolveDuckyApiOrigin,
      }),
    };
    mcpConnectionPool =
      configResult.config.features.mcp === false
        ? undefined
        : createMcpAdapterConnectionPool({
            clientVersion: options.version ?? "0.0.0",
            env: options.env,
            logger,
            network: {
              httpProxy: configResult.config.network.httpProxy,
              noProxy: configResult.config.network.noProxy,
              caCertFile: configResult.config.network.caCertFile,
            },
            officialMcpAuth,
            telemetry: mcpTelemetryTracker,
            workingDirectory: options.cwd,
          });
    mcpPort = mcpConnectionPool?.acquireLease({ leaseId: "protocol-settings" });
    const activeProviderRegistryRuntime = providerRegistryRuntime;
    const modelSelectionFacade = createNodeModelSelectionFacade(
      activeProviderRegistryRuntime.runtime.registryService,
    );
    options.lifecycle?.signal.throwIfAborted();
    const server = (serverForCleanup = new DuckyProtocolAgentServer({
      createDuckyApp: (appOptions = {}) =>
        createDuckyApp({
          ...applyProtocolProviderRegistry(
            applyProtocolPresentationSurface(appOptions, presentationSurface),
            activeProviderRegistryRuntime.runtime.registryService,
            activeProviderRegistryRuntime.configuredDefaultModelSelection,
          ),
          // 只读同进程已应用快照；不为子任务另发 Host RPC，也不在 ModelFactory 偷换模型。
          resolveEffectiveModelSelection: (selection) => {
            const view = modelSelectionFacade.getView(undefined, undefined, { selection });
            return {
              effectiveSelection: view.effectiveSelection ?? null,
              selectionIssue: view.selectionIssue,
            };
          },
          env: {
            ...telemetryEnv,
            ...appOptions.env,
            ...(telemetryDeviceMid ? { DUCKY_TELEMETRY_DEVICE_MID: telemetryDeviceMid } : {}),
          },
          ...(nodeReplBrowserBroker ? { nodeReplBrowserBroker } : {}),
          ...(mcpConnectionPool
            ? {
                mcpPortFactory: () =>
                  mcpConnectionPool!.acquireLease({
                    leaseId: appOptions.sessionId,
                    sessionId: appOptions.sessionId,
                  }),
              }
            : {}),
          sourceTitle: "electron",
          onToolExecResource: (params) =>
            connection.send({ method: duckyProtocolNotifications.toolExecResource, params }),
        }),
      cwd: options.cwd,
      env: options.env,
      loggerFactory,
      mcpPort,
      mcpTelemetry: mcpTelemetryTracker,
      sessionStore,
      syncAccountProviderConfig: activeProviderRegistryRuntime.syncAccountProviderConfig,
      refreshProviderRegistry: async (reason) => {
        await activeProviderRegistryRuntime.runtime.registryService.refresh(reason);
      },
      version: options.version,
    }));
    officialMcpAuthContext = server.officialMcpAuthRequestContext;
    if (configResult.config.features.mcp !== false) {
      nodeReplBrowserBroker = createNodeReplBrowserBroker({
        browserControlPort: server.browserControlPort,
        logger,
        platform: process.platform,
      });
      const broker = nodeReplBrowserBroker;
      await acquireProtocolStartupResource({
        signal: options.lifecycle?.signal,
        logger,
        create: () => broker.ready,
      });
    }
    const connection = new DuckyProtocolNdjsonConnection({
      signal: options.lifecycle?.signal,
      clearPostResponseMessages: () => server.clearPostResponseMessages(),
      handleMessage: (message) => server.handleMessage(message),
      input,
      logger,
      onTransportClosed: (error) => server.disconnectClient(error),
      output,
      takePostResponseBatch: (requestId) => server.takePostResponseBatch(requestId),
    });
    server.setNotificationSink((notification) => connection.send(notification));
    mcpResourceSink = (samples) =>
      connection.send({
        method: duckyProtocolNotifications.mcpResourceSamples,
        params: samples,
      });
    mcpTelemetrySink = (event) => {
      // 五分钟资源通知取代旧内存通知；tracker 内部孤儿事实仍保留原判据。
      if (event.kind === "memory") return;
      connection.send({
        method: duckyProtocolNotifications.mcpTelemetry,
        params: event,
      });
    };
    connection.start();
    mcpTelemetryTracker?.start();
    processResourceSampler = startProtocolResourceSampler(
      server,
      (message) => connection.send(message),
      logger,
    );
    startupTimer.complete("Ducky Protocol agent startup completed", {
      event: "ducky_protocol.startup.completed",
      stage: "total",
    });
    scheduleStartupLogRetentionCleanup(loggerFactory, logger);
    await connection.waitForClose();
  } catch (error) {
    options.lifecycle?.requestShutdown(
      error instanceof Error ? error : new Error("Protocol runtime failed", { cause: error }),
    );
    startupTimer.fail("Ducky Protocol agent startup failed", error, {
      event: "ducky_protocol.startup.failed",
      stage: "total",
    });
    throw error;
  } finally {
    options.lifecycle?.requestShutdown();
    await cleanupProtocolRuntime({
      logger,
      deadlineAt: options.lifecycle?.deadlineAt,
      server: serverForCleanup,
      processResourceSampler,
      mcpTelemetryTracker,
      nodeReplBrowserBroker,
      mcpPort,
      mcpConnectionPool,
      sessionStore,
      providerRegistryRuntime,
    });
    logger.info("Ducky Protocol agent shutdown completed", {
      ...traceContextToLogContext(traceContext),
      event: "ducky_protocol.shutdown.completed",
      module: "bootstrap.ducky_protocol",
      status: "completed",
    });
  }
}

function resolveProtocolRuntimeSurface(
  env: NodeJS.ProcessEnv,
): "desktop_local_host" | "remote_workspace_host" {
  // Bug 根因：入口曾无条件覆盖 Host 注入值，远程 SSH/WSL/容器 Trace 被归入本地 Desktop。
  return env.DUCKY_TELEMETRY_RUNTIME_SURFACE?.trim() === "remote_workspace_host"
    ? "remote_workspace_host"
    : "desktop_local_host";
}
