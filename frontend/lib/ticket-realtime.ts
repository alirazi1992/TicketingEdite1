import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from "@microsoft/signalr";
import type { ApiTicketUpdatedEvent } from "@/lib/api-types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:5000";

const HUB_URL = `${API_BASE_URL}/hubs/ticket`;

let connection: HubConnection | null = null;
const listeners = new Set<(event: ApiTicketUpdatedEvent) => void>();
const joinedTicketIds = new Set<string>();
let joinedUserGroup = false;
let joinedRoleGroup: string | null = null;

const notifyListeners = (event: ApiTicketUpdatedEvent) => {
  listeners.forEach((listener) => listener(event));
};

const rejoinGroups = async () => {
  if (!connection || connection.state !== HubConnectionState.Connected) return;

  if (joinedUserGroup) {
    await connection.invoke("JoinUserGroup");
  }

  if (joinedRoleGroup) {
    await connection.invoke("JoinRoleGroup", joinedRoleGroup);
  }

  for (const ticketId of joinedTicketIds) {
    await connection.invoke("JoinTicketGroup", ticketId);
  }
};

export const ensureTicketHubConnection = async (token: string) => {
  if (!connection) {
    connection = new HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    connection.on("TicketUpdated", (event: ApiTicketUpdatedEvent) => {
      notifyListeners(event);
    });

    connection.onreconnected(async () => {
      await rejoinGroups();
    });
  }

  if (connection.state === HubConnectionState.Disconnected) {
    await connection.start();
    await rejoinGroups();
  }

  return connection;
};

export const subscribeToTicketUpdates = (listener: (event: ApiTicketUpdatedEvent) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const joinUserGroup = async () => {
  if (!connection) return;
  if (connection.state !== HubConnectionState.Connected) return;
  if (joinedUserGroup) return;
  await connection.invoke("JoinUserGroup");
  joinedUserGroup = true;
};

export const joinRoleGroup = async (role: string) => {
  if (!connection) return;
  if (connection.state !== HubConnectionState.Connected) return;
  if (joinedRoleGroup === role) return;
  await connection.invoke("JoinRoleGroup", role);
  joinedRoleGroup = role;
};

export const joinTicketGroup = async (ticketId: string) => {
  if (!connection) return;
  if (connection.state !== HubConnectionState.Connected) return;
  if (joinedTicketIds.has(ticketId)) return;
  await connection.invoke("JoinTicketGroup", ticketId);
  joinedTicketIds.add(ticketId);
};

export const leaveTicketGroup = async (ticketId: string) => {
  if (!connection) return;
  if (connection.state !== HubConnectionState.Connected) return;
  if (!joinedTicketIds.has(ticketId)) return;
  await connection.invoke("LeaveTicketGroup", ticketId);
  joinedTicketIds.delete(ticketId);
};
