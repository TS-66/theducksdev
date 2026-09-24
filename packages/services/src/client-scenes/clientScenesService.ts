import type { ApiClient } from "@ducky/shared";
import { readApiJson } from "../providers/api/apiJson.js";
import { DUCKY_CLIENT_SCENES_URL } from "../providers/api/apiEndpoints.js";
import type { ClientScenesResponse, IClientScenesService } from "./clientScenes.js";

export function createClientScenesService(dependencies: {
  apiClient: ApiClient;
}): IClientScenesService {
  return {
    list: () =>
      readApiJson<ClientScenesResponse>(dependencies.apiClient, DUCKY_CLIENT_SCENES_URL, {
        method: "GET",
      }),
  };
}
