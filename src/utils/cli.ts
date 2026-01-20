import { createInterface } from "node:readline/promises";

/**
 * Espera a que el usuario presione Enter o que pase el tiempo límite.
 * @param message Mensaje a mostrar
 * @param timeoutMs Tiempo en milisegundos (10000 por defecto)
 */
export async function waitForInputOrTimeout(
  message: string,
  timeoutMs: number = 10000
): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`\n${message} await ${timeoutMs / 1000}s...`);

  // Creamos una promesa que se resuelve por tiempo
  const timer = new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, timeoutMs);
  });

  // Creamos una promesa que se resuelve por input
  const input = rl.question("Press any key to continue...");

  // Esperamos a la que ocurra primero
  await Promise.race([timer, input]);
  
  rl.close();
}