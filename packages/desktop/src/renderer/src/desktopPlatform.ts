import { recordArmsCustomEventForE2E } from "@ducky/ui";
import { DesktopCommandIds, buildLocalMediaPreviewUrl, type IPlatformService } from "@ducky/shared";

import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  return {
    canSelectFilePath: true,
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: () => window.ducky.selectDirectory(),
    selectFile: () => window.ducky.selectFile(),
    selectFiles: () => window.ducky.selectFiles?.() ?? Promise.resolve([]),
    createTempTextAttachment: (payload) => window.ducky.createTempTextAttachment(payload),
    onRemoteConnectionLog: (handler) => window.ducky.onRemoteConnectionLog(handler),
    onRemoteSessionClosed: (handler) => window.ducky.onRemoteSessionClosed(handler),
    onBotRemoteWorkspaceReconnected: (handler) =>
      window.ducky.onBotRemoteWorkspaceReconnected(handler),
    activateOrSetWorkspace: (path) =>
      window.ducky.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
    connectRemote: (remoteOptions, requestId, context) =>
      window.ducky.connectRemote(remoteOptions, requestId, context),
    cancelPendingRemoteConnection: (requestId) =>
      window.ducky.cancelPendingRemoteConnection?.(requestId) ?? Promise.resolve(),
    bindRemoteWorkspaceSessionContext: (context) =>
      window.ducky.bindRemoteWorkspaceSessionContext?.(context) ?? Promise.resolve(),
    disposeRemoteSession: (sessionId) => window.ducky.disposeRemoteSession(sessionId),
    isDockerAvailable: () => window.ducky.isDockerAvailable(),
    listWSLDistros: () => window.ducky.listWSLDistros(),
    listDockerContainers: () => window.ducky.listDockerContainers(),
    listSSHConfigAliases: () => window.ducky.listSSHConfigAliases(),
    loadMcpFromUserDirectory: (payload) => window.ducky.loadMcpFromUserDirectory(payload),
    saveMcpToUserDirectory: (payload) => window.ducky.saveMcpToUserDirectory(payload),
    migrateLegacyCommonMcp: (payload) => window.ducky.migrateLegacyCommonMcp(payload),
    openExternal: (url) => window.ducky.openExternal(url),
    openFeedback: () => window.ducky.executeDesktopCommand(DesktopCommandIds.OpenFeedback),
    openCommunity: () => window.ducky.executeDesktopCommand(DesktopCommandIds.OpenCommunity),
    canOpenCommunity: (locale) => window.ducky.canOpenCommunity(locale),
    openInFileManager: (path) => window.ducky.openInFileManager(path),
    openExternalFile: (path) => window.ducky.openExternalFile(path),
    openCuaPermissionOnboarding: window.ducky.openCuaPermissionOnboarding
      ? (permissionOptions) =>
          window.ducky.openCuaPermissionOnboarding?.(permissionOptions) ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    prepareCuaHelperPermissionDrag: window.ducky.prepareCuaHelperPermissionDrag
      ? () =>
          window.ducky.prepareCuaHelperPermissionDrag?.() ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    startCuaHelperPermissionDrag: window.ducky.startCuaHelperPermissionDrag
      ? () => window.ducky.startCuaHelperPermissionDrag?.()
      : undefined,
    onPaymentCallback: (callback) => window.ducky.onPaymentCallback(callback),
    onShareImport: (callback) => window.ducky.onShareImport?.(callback) ?? (() => {}),
    notifyRendererReady: () => window.ducky.notifyRendererReady(),
    reportTelemetryEvent: (payload) => window.ducky.reportTelemetryEvent(payload),
    reportArmsCustomEvent: (payload) => {
      recordArmsCustomEventForE2E(payload);
      return window.ducky.reportArmsCustomEvent(payload);
    },
    getRendererActionTraceConfig: window.ducky.getRendererActionTraceConfig
      ? () => window.ducky.getRendererActionTraceConfig!()
      : undefined,
    onRendererActionTraceConfigChanged: window.ducky.onRendererActionTraceConfigChanged
      ? (callback) => window.ducky.onRendererActionTraceConfigChanged!(callback)
      : undefined,
    reportLocalTtftBatch: (batch) => window.ducky.reportLocalTtftBatch(batch),
    reportRendererActionTraceBatch: window.ducky.reportRendererActionTraceBatch
      ? (batch) => window.ducky.reportRendererActionTraceBatch!(batch)
      : undefined,
    reportRendererHeapSample: window.ducky.reportRendererHeapSample
      ? (sample) => window.ducky.reportRendererHeapSample!(sample)
      : undefined,
    showTaskNotification: (payload) => window.ducky.showTaskNotification(payload),
    syncWindowTabs: (paths) => window.ducky.syncWindowTabs(paths),
    syncWindowUnreadCount: (count) => window.ducky.syncWindowUnreadCount(count),
    syncActiveTaskSession: (sessionId) => window.ducky.syncActiveTaskSession(sessionId),
    syncAppSettings: (patch) => window.ducky.syncAppSettings?.(patch),
    setShortcutRecordingActive: (active) => window.ducky.setShortcutRecordingActive?.(active),
    onFocusTab: (handler) => window.ducky.onFocusTab(handler),
    onNewTab: (handler) => window.ducky.onNewTab(handler),
    onCloseActiveContextRequest: (handler) =>
      window.ducky.onCloseActiveContextRequest?.(handler) ?? (() => {}),
    onOpenBrowserUrl: (handler) => window.ducky.onOpenBrowserUrl?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfacePrepare: (handler) =>
      window.ducky.onBrowserViewScreenshotSurfacePrepare?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfaceRelease: (handler) =>
      window.ducky.onBrowserViewScreenshotSurfaceRelease?.(handler) ?? (() => {}),
    browserViewScreenshotSurfaceReady: (payload) =>
      window.ducky.browserViewScreenshotSurfaceReady?.(payload),
    ...desktopBrowserPlatformBridge,
    onNewTask: (handler) => window.ducky.onNewTask(handler),
    onOpenWorkspace: (handler) => {
      // 开发态或升级后的旧窗口可能仍运行未暴露 onOpenWorkspace 的 preload，
      // renderer 直接调用会在启动时崩溃。这里和 activateOrSetWorkspace 一样做兼容兜底，
      // 缺少该 bridge 时只禁用原生菜单回调，不影响应用继续打开。
      return window.ducky.onOpenWorkspace?.(handler) ?? (() => {});
    },
    onOpenWorkspacePath: (handler) => window.ducky.onOpenWorkspacePath?.(handler) ?? (() => {}),
    onOpenFeedbackDialog: (handler) => window.ducky.onOpenFeedbackDialog?.(handler) ?? (() => {}),
    onOpenTicketsPanel: (handler) => window.ducky.onOpenTicketsPanel?.(handler) ?? (() => {}),
    onWindowFullscreenChanged: (handler) => window.ducky.onWindowFullscreenChanged(handler),
    getDesktopWindowChromeState: window.ducky.getDesktopWindowChromeState
      ? () => window.ducky.getDesktopWindowChromeState!()
      : undefined,
    onDesktopWindowChromeStateChanged: window.ducky.onDesktopWindowChromeStateChanged
      ? (handler) => window.ducky.onDesktopWindowChromeStateChanged!(handler)
      : undefined,
    getWindowControlsOverlayMetrics: () => window.ducky.getWindowControlsOverlayMetrics?.() ?? null,
    onWindowControlsOverlayChanged: (handler) =>
      window.ducky.onWindowControlsOverlayChanged?.(handler) ?? (() => {}),
    getDesktopZoomLevel: () =>
      window.ducky.getDesktopZoomLevel?.() ?? Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: (handler) =>
      window.ducky.onDesktopZoomLevelChanged?.(handler) ?? (() => {}),
    onTaskNotificationClick: (handler) => window.ducky.onTaskNotificationClick(handler),
    exportLogs: () => window.ducky.exportLogs(),
    captureWindowScreenshot: () =>
      window.ducky.captureWindowScreenshot?.() ?? Promise.resolve(null),
    onUpdateReady: (callback) => window.ducky.onUpdateReady(callback),
    onUpdateCheckResult: (callback) => window.ducky.onUpdateCheckResult(callback),
    onUpdateStateChanged: (callback) => window.ducky.onUpdateStateChanged?.(callback) ?? (() => {}),
    getUpdateState: () =>
      window.ducky.getUpdateState?.() ?? Promise.resolve({ kind: "idle", enabled: true }),
    downloadUpdate: () => window.ducky.downloadUpdate?.() ?? Promise.resolve(),
    cancelUpdateDownload: () => window.ducky.cancelUpdateDownload?.() ?? Promise.resolve(),
    openUpdateStatusWindow: () => window.ducky.openUpdateStatusWindow?.() ?? Promise.resolve(),
    getAutoUpdatePreferences: () =>
      window.ducky.getAutoUpdatePreferences?.() ??
      Promise.resolve({ autoDownloadAndInstallUpdates: false }),
    setAutoDownloadAndInstallUpdates: (enabled) =>
      window.ducky.setAutoDownloadAndInstallUpdates?.(enabled) ?? Promise.resolve(),
    getDesktopSessionActivity: () =>
      window.ducky.getDesktopSessionActivity?.() ??
      Promise.resolve({ runningAgentSessionCount: 0 }),
    getDuckyStdioTapDevState: () =>
      window.ducky.getDuckyStdioTapDevState?.() ??
      Promise.resolve({ enabled: false, visible: false, logDir: "", statePath: "" }),
    onSettingsChanged: (callback) => window.ducky.onSettingsChanged?.(callback) ?? (() => {}),
    onApplicationLocaleChanged: (callback) =>
      window.ducky.onApplicationLocaleChanged?.(callback) ?? (() => {}),
    onPostUpdateReleaseNotes: (callback) => window.ducky.onPostUpdateReleaseNotes(callback),
    acknowledgePostUpdateReleaseNotes: (version) =>
      window.ducky.acknowledgePostUpdateReleaseNotes(version),
    skipUpdateVersion: (version) => window.ducky.skipUpdateVersion?.(version) ?? Promise.resolve(),
    quitAndInstallUpdate: () => window.ducky.quitAndInstallUpdate(),
    getInstalledEditors: () => window.ducky.getInstalledEditors(),
    getApplicationIcon: (bundleId) =>
      window.ducky.getApplicationIcon?.(bundleId) ?? Promise.resolve(null),
    openInEditor: (editorId, path, editorOptions) =>
      window.ducky.openInEditor(editorId, path, editorOptions),
    executeDesktopCommand: (command) => window.ducky.executeDesktopCommand(command),
    setApplicationLocale: (locale) => window.ducky.setApplicationLocale(locale),
    getSystemLocale: () =>
      window.ducky.getSystemLocale?.() ??
      Promise.resolve(navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"),
    setTitleBarTheme: (theme) => window.ducky.setTitleBarTheme(theme),
    getDeviceId: () =>
      (window as Window & { __DUCKY_DEVICE_ID__?: string }).__DUCKY_DEVICE_ID__ ?? "",
  };
}
