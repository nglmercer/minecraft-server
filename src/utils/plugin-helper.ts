import type { PluginContext } from "bun_plugins";

/**
 * Helper function para obtener plugins con tipado estático
 * Esta función permite obtener plugins con autocompletado sin depender de tipos generados dinámicamente
 */
export async function getPlugin<T>(context: PluginContext, name: string): Promise<T | undefined> {
  return await context.getPlugin(name) as T | undefined;
}
