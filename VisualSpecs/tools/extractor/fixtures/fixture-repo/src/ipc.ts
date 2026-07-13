// The facade. Every command call in the frontend goes through it.
export interface Config {
  theme: string;
}

interface Transport {
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

declare function currentTransport(): Transport;

const transport = {
  // The facade's OWN dispatch: `cmd` is a variable, so this can never be resolved
  // to a command. It must land in `unresolved`, not become a phantom edge.
  invoke: <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
    currentTransport().invoke<T>(cmd, args),
};

/** Bound to BOTH backends. */
export const getConfig = (): Promise<Config> => transport.invoke<Config>('get_config');

/** Web-router only: it has no #[tauri::command]. */
export const wsOnly = (): Promise<void> => transport.invoke<void>('ws_only');
