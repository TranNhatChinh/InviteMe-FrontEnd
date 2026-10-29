import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";
import {
  REALTIME_EVENTS,
  weddingEventSchema,
  planningChangeSchema,
  type RealtimeEvent,
  type WeddingEvent,
  type PlanningChange,
} from "./realtime-events";
import {
  seatingDragSnapshotSchema,
  seatingDragPointerSchema,
  type SeatingDragSnapshot,
  type SeatingDragPointer,
} from "./seating-drag-events";

export type RealtimeStatus =
  "disabled" | "disconnected" | "connecting" | "connected" | "reconnecting";

export class RealtimeClient {
  private connection: HubConnection | undefined;
  private activeWedding: string | null = null;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private status: RealtimeStatus;
  private listeners = new Set<() => void>();
  private resyncListeners = new Set<(since: number | null) => void>();
  private planningListeners = new Set<(change: PlanningChange) => void>();
  private handlers = new Map<RealtimeEvent, Set<(event: WeddingEvent) => void>>();
  private dragListeners = new Set<(snapshot: SeatingDragSnapshot) => void>();
  private pointerListeners = new Set<(pointer: SeatingDragPointer) => void>();
  private latestPointers = new Map<string, SeatingDragPointer>();
  getSeatingPointer(connectionId: string, dragId: string) {
    const pointer = this.latestPointers.get(connectionId);
    return pointer?.dragId === dragId ? pointer : undefined;
  }
  onSeatingPointer(listener: (pointer: SeatingDragPointer) => void) {
    this.pointerListeners.add(listener);
    return () => {
      this.pointerListeners.delete(listener);
    };
  }
  getConnectionId = () => this.connection?.connectionId ?? null;
  async sendSeatingPointer(weddingId: string, ...args: unknown[]): Promise<void> {
    const connection = this.connection;
    const generation = this.generation;
    if (!connection || this.status !== "connected" || weddingId !== this.activeWedding)
      throw new Error("SEATING_REALTIME_DISCONNECTED");
    await connection.send("MoveSeatingPointerWithTarget", weddingId, ...args);
    if (this.connection !== connection || this.generation !== generation)
      throw new Error("SEATING_REALTIME_DISCONNECTED");
  }
  onSeatingDrags(listener: (snapshot: SeatingDragSnapshot) => void) {
    this.dragListeners.add(listener);
    return () => {
      this.dragListeners.delete(listener);
    };
  }
  async invokeSeating<T>(
    method:
      | "GetSeatingDrags"
      | "StartSeatingDrag"
      | "RenewSeatingDrag"
      | "TargetSeatingDrag"
      | "EndSeatingDrag"
      | "MoveSeatingPointer",
    weddingId: string,
    ...args: unknown[]
  ): Promise<T> {
    const connection = this.connection;
    const generation = this.generation;
    if (!connection || this.status !== "connected" || weddingId !== this.activeWedding)
      throw new Error("SEATING_REALTIME_DISCONNECTED");
    const result = await connection.invoke<T>(method, weddingId, ...args);
    if (this.connection !== connection || this.generation !== generation)
      throw new Error("SEATING_REALTIME_DISCONNECTED");
    return result;
  }
  constructor(
    private url: string | undefined,
    private getToken: () => Promise<string | null>,
  ) {
    this.status = url ? "disconnected" : "disabled";
  }
  getStatus = () => this.status;
  getServerStatus = (): RealtimeStatus => (this.url ? "disconnected" : "disabled");
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private setStatus(status: RealtimeStatus) {
    if (status !== "connected") this.latestPointers.clear();
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }
  /**
   * Called after joining the wedding room. since = when the first connection started (data fetched from then on already
   * covers every change, so only older data needs a refetch); null after a reconnect, when anything may have been missed.
   */
  onResync(listener: (since: number | null) => void) {
    this.resyncListeners.add(listener);
    return () => {
      this.resyncListeners.delete(listener);
    };
  }
  onPlanningChange(listener: (change: PlanningChange) => void) {
    this.planningListeners.add(listener);
    return () => {
      this.planningListeners.delete(listener);
    };
  }
  on(event: RealtimeEvent, listener: (event: WeddingEvent) => void) {
    const listeners = this.handlers.get(event) ?? new Set();
    listeners.add(listener);
    this.handlers.set(event, listeners);
    return () => {
      listeners.delete(listener);
    };
  }
  private createConnection(weddingId: string, generation: number) {
    if (!this.url) return undefined;
    const connection = new HubConnectionBuilder()
      .withUrl(this.url, {
        accessTokenFactory: async () => {
          const token = await this.getToken();
          if (!token) throw new Error("Authentication required");
          return token;
        },
      })
      .withAutomaticReconnect([0, 2_000, 10_000, 30_000])
      .configureLogging(LogLevel.None)
      .build();
    const isCurrent = () =>
      this.connection === connection &&
      this.generation === generation &&
      this.activeWedding === weddingId;
    connection.on("SeatingDragSnapshot", (payload: unknown) => {
      const parsed = seatingDragSnapshotSchema.safeParse(payload);
      if (isCurrent() && parsed.success && parsed.data.weddingId === weddingId)
        this.dragListeners.forEach((listener) => listener(parsed.data));
    });
    connection.on("SeatingDragPointer", (payload: unknown) => {
      const parsed = seatingDragPointerSchema.safeParse(payload);
      if (isCurrent() && parsed.success && parsed.data.weddingId === weddingId) {
        const pointer = parsed.data;
        const old = this.latestPointers.get(pointer.connectionId);
        if (old?.dragId === pointer.dragId && old.sequence >= pointer.sequence) return;
        this.latestPointers.set(pointer.connectionId, pointer);
        const oldest = this.latestPointers.keys().next().value;
        if (this.latestPointers.size > 32 && oldest !== undefined)
          this.latestPointers.delete(oldest);
        this.pointerListeners.forEach((listener) => listener(parsed.data));
      }
    });
    for (const event of Object.values(REALTIME_EVENTS)) {
      connection.on(event, (payload: unknown) => {
        const parsed = weddingEventSchema.safeParse(payload);
        if (isCurrent() && parsed.success && parsed.data.weddingId === this.activeWedding)
          this.handlers.get(event)?.forEach((handler) => handler(parsed.data));
      });
    }
    connection.on("weddingChanged", (payload: unknown) => {
      const parsed = planningChangeSchema.safeParse(payload);
      if (!isCurrent() || !parsed.success) return;
      const change = parsed.data;
      if (
        ["PlanningSeatingChanged", "PlanningGuestsImported", "PlanningSeatingNeedsAttention"].includes(change.type) &&
        change.entityId !== weddingId
      ) return;
      this.planningListeners.forEach((listener) => listener(change));
      if (
        [
          "PlanningSeatingChanged",
          "PlanningGuestsImported",
          "PlanningSeatingNeedsAttention",
          "RsvpChanged",
        ].includes(change.type)
      ) {
        this.handlers
          .get(REALTIME_EVENTS.seating)
          ?.forEach((handler) => handler({ weddingId, version: change.version ?? 0 }));
      }
    });
    connection.onreconnecting(() => {
      if (isCurrent()) this.setStatus("reconnecting");
    });
    connection.onreconnected(async () => {
      if (!isCurrent()) return;
      try {
        await connection.invoke("JoinWedding", weddingId);
        if (isCurrent()) {
          this.setStatus("connected");
          this.resyncListeners.forEach((listener) => listener(null));
        }
      } catch {
        await connection.stop();
      }
    });
    connection.onclose(() => {
      if (!isCurrent()) return;
      this.setStatus("disconnected");
      this.scheduleRetry();
    });
    return connection;
  }
  private scheduleRetry() {
    clearTimeout(this.retryTimer);
    const weddingId = this.activeWedding;
    const generation = this.generation;
    if (weddingId)
      this.retryTimer = setTimeout(() => {
        if (generation === this.generation) void this.activate(weddingId);
      }, 10_000);
  }
  activate(weddingId: string | null): Promise<void> {
    this.activeWedding = weddingId;
    const generation = ++this.generation;
    clearTimeout(this.retryTimer);
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation) return;
        if (!this.url) return;
        const previous = this.connection;
        this.connection = undefined;
        if (previous) await previous.stop();
        if (generation !== this.generation) return;
        if (!weddingId) {
          this.setStatus("disconnected");
          return;
        }
        const connection = this.createConnection(weddingId, generation);
        this.connection = connection;
        if (!connection) return;
        this.setStatus("connecting");
        const since = Date.now();
        try {
          await connection.start();
          if (generation !== this.generation) return;
          await connection.invoke("JoinWedding", weddingId);
          if (generation !== this.generation) return;
          this.setStatus("connected");
          clearTimeout(this.retryTimer);
          this.resyncListeners.forEach((listener) => listener(since));
        } catch {
          if (connection.state !== HubConnectionState.Disconnected) await connection.stop();
          if (generation !== this.generation) return;
          this.setStatus("disconnected");
          this.scheduleRetry();
        }
      });
    return this.queue;
  }
}
