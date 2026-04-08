/**
 * Interfaz por defecto para el retorno
 */
export interface SocketIoEvent<T = any> {
  eventName: string;
  data: T;
}

/**
 * Resultado de parseo con información de error
 */
export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Resultado de validación manual
 */
export type ValidationResult<T = any> = 
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Tipo para una función validadora
 */
export type Validator<T = any> = (data: any) => ValidationResult<T>;

/**
 * Parsea un mensaje de Socket.io 42 con mapeo de llaves opcional.
 * @param message - El string crudo del socket (ej: '42["chat", {}]')
 * @param keys - (Opcional) Diccionario para renombrar las llaves de salida
 */
export function parseSocketIo42Message<
  T = any, 
  E extends string = 'eventName', 
  D extends string = 'data'
>(
  message: string,
  keys?: { event: E; data: D }
): { [K in E]: string } & { [K in D]: T } | null {
  
  // Validamos el prefijo del protocolo Socket.io
  if (!message || !message.startsWith('42')) {
    return null;
  }

  try {
    // Extraemos y parseamos el JSON (saltando el "42")
    const parsed = JSON.parse(message.substring(2));

    if (Array.isArray(parsed) && parsed.length >= 1) {
      // Definimos las llaves que usaremos: las proveídas o las de SocketIoEvent por defecto
      const eventKey = keys?.event ?? ('eventName' as E);
      const dataKey = keys?.data ?? ('data' as D);

      return {
        [eventKey]: parsed[0],
        [dataKey]: parsed.length > 1 ? parsed[1] : null
      } as { [K in E]: string } & { [K in D]: T };
    }
  } catch (error) {
    console.error("Error parsing Socket.io message:", error);
  }

  return null;
}

export enum SocketIoPacketType {
  OPEN = '0',
  CLOSE = '1',
  PING = '2',
  PONG = '3',
  MESSAGE = '4',
  UPGRADE = '5',
  NOOP = '6',
}

export enum SocketIoMessageType {
  CONNECT = '0',
  DISCONNECT = '1',
  EVENT = '2',
  ACK = '3',
  ERROR = '4',
  BINARY_EVENT = '5',
  BINARY_ACK = '6',
}

export function SocketIoMessage(message: string) {
  if (!message || message.length < 1) return null;

  const engineType = message[0]; 
  // El socketType solo existe si engineType es '4' (MESSAGE)
  const socketType = engineType === '4' ? message[1] : undefined;

  // Determinamos dónde empieza el JSON real
  // Si es '42', el JSON empieza en el índice 2. Si es '2' (PING), no hay JSON.
  const payloadOffset = engineType === '4' ? 2 : 1;
  const payloadRaw = message.substring(payloadOffset);

  return {
    engineType,
    socketType,
    isData: message.startsWith('42'),
    payloadRaw
  };
}

/**
 * Parsea un string JSON genérico con manejo de errores
 * @param jsonString - String JSON a parsear
 * @returns ParseResult con el resultado del parseo
 */
export function parseJson<T = any>(jsonString: string): ParseResult<T> {
  if (!jsonString || typeof jsonString !== 'string') {
    return {
      success: false,
      error: 'Input must be a non-empty string'
    };
  }

  try {
    const parsed = JSON.parse(jsonString);
    return {
      success: true,
      data: parsed as T
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}

/**
 * Parsea un string JSON y valida contra un validador
 * @param jsonString - String JSON a parsear
 * @param validator - Función validadora
 * @returns ParseResult con el resultado del parseo y validación
 */
export function parseJsonWithSchema<T = any>(
  jsonString: string,
  validator: Validator<T>
): ParseResult<T> {
  const parseResult = parseJson<any>(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  const validation = validator(parseResult.data);
  
  if (!validation.success) {
    return {
      success: false,
      error: validation.error
    };
  }

  return {
    success: true,
    data: validation.data
  };
}

/**
 * Parsea un string JSON que debe ser un array
 * @param jsonString - String JSON a parsear
 * @returns ParseResult con el array parseado
 */
export function parseJsonArray<T = any>(jsonString: string): ParseResult<T[]> {
  const parseResult = parseJson<T[]>(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  if (!Array.isArray(parseResult.data)) {
    return {
      success: false,
      error: 'Parsed JSON is not an array'
    };
  }

  return {
    success: true,
    data: parseResult.data
  };
}

/**
 * Parsea un string JSON que debe ser un array y valida cada elemento con un validador
 * @param jsonString - String JSON a parsear
 * @param validator - Función validadora para cada elemento del array
 * @returns ParseResult con el array validado
 */
export function parseJsonArrayWithSchema<T = any>(
  jsonString: string,
  validator: Validator<T>
): ParseResult<T[]> {
  const parseResult = parseJsonArray<any>(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  const validatedData: T[] = [];

  // Validar cada elemento del array
  for (let i = 0; i < parseResult.data!.length; i++) {
    const validation = validator(parseResult.data![i]);
    
    if (!validation.success) {
      return {
        success: false,
        error: `Error at index ${i}: ${validation.error}`
      };
    }
    
    validatedData.push(validation.data);
  }

  return {
    success: true,
    data: validatedData
  };
}

/**
 * Parsea un string JSON que debe ser un objeto
 * @param jsonString - String JSON a parsear
 * @returns ParseResult con el objeto parseado
 */
export function parseJsonObject<T = Record<string, any>>(jsonString: string): ParseResult<T> {
  const parseResult = parseJson<T>(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  if (typeof parseResult.data !== 'object' || parseResult.data === null || Array.isArray(parseResult.data)) {
    return {
      success: false,
      error: 'Parsed JSON is not an object'
    };
  }

  return {
    success: true,
    data: parseResult.data
  };
}

/**
 * Parsea un string JSON que debe ser un objeto y valida con un validador
 * @param jsonString - String JSON a parsear
 * @param validator - Función validadora para el objeto
 * @returns ParseResult con el objeto validado
 */
export function parseJsonObjectWithSchema<T = Record<string, any>>(
  jsonString: string,
  validator: Validator<T>
): ParseResult<T> {
  const parseResult = parseJsonObject<any>(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  const validation = validator(parseResult.data);
  
  if (!validation.success) {
    return {
      success: false,
      error: validation.error
    };
  }

  return {
    success: true,
    data: validation.data
  };
}

/**
 * Parsea un string JSON que debe ser un valor primitivo (string, number, boolean, null)
 * @param jsonString - String JSON a parsear
 * @returns ParseResult con el valor primitivo parseado
 */
export function parseJsonPrimitive(jsonString: string): ParseResult<string | number | boolean | null> {
  const parseResult = parseJson<string | number | boolean | null>(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  const value = parseResult.data;
  
  if (typeof value === 'object' && value !== null) {
    return {
      success: false,
      error: 'Parsed JSON is not a primitive value'
    };
  }

  return {
    success: true,
    data: value
  };
}

/**
 * Parsea un string JSON de forma segura con opciones de configuración
 * @param jsonString - String JSON a parsear
 * @param options - Opciones de configuración
 * @returns ParseResult con el resultado del parseo
 */
export function parseJsonSafe<T = any>(
  jsonString: string,
  options: {
    reviver?: (key: string, value: any) => any;
    strict?: boolean;
    maxDepth?: number;
  } = {}
): ParseResult<T> {
  if (!jsonString || typeof jsonString !== 'string') {
    return {
      success: false,
      error: 'Input must be a non-empty string'
    };
  }

  try {
    // Validar profundidad máxima si está especificado
    if (options.strict && options.maxDepth !== undefined) {
      const depth = calculateJsonDepth(jsonString);
      if (depth > options.maxDepth) {
        return {
          success: false,
          error: `JSON depth exceeds maximum allowed depth of ${options.maxDepth}`
        };
      }
    }

    const parsed = JSON.parse(jsonString, options.reviver);
    return {
      success: true,
      data: parsed as T
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}

/**
 * Calcula la profundidad de un string JSON
 * @param jsonString - String JSON a analizar
 * @returns Profundidad del JSON
 */
function calculateJsonDepth(jsonString: string): number {
  let maxDepth = 0;
  let currentDepth = 0;

  for (const char of jsonString) {
    if (char === '{' || char === '[') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else if (char === '}' || char === ']') {
      currentDepth--;
    }
  }

  return maxDepth;
}

/**
 * Parsea múltiples strings JSON de una sola vez
 * @param jsonStrings - Array de strings JSON a parsear
 * @returns Array de ParseResult
 */
export function parseMultipleJson<T = any>(jsonStrings: string[]): ParseResult<T>[] {
  return jsonStrings.map(str => parseJson<T>(str));
}

/**
 * Parsea un string JSON y lo formatea de forma bonita
 * @param jsonString - String JSON a parsear y formatear
 * @param indent - Número de espacios para indentación (default: 2)
 * @returns ParseResult con el JSON formateado
 */
export function parseAndFormatJson(jsonString: string, indent: number = 2): ParseResult<string> {
  const parseResult = parseJson(jsonString);
  
  if (!parseResult.success) {
    return parseResult;
  }

  try {
    const formatted = JSON.stringify(parseResult.data, null, indent);
    return {
      success: true,
      data: formatted
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Formatting error'
    };
  }
}

/**
 * Parsea un mensaje de Socket.io 42 con validación manual
 * @param message - El string crudo del socket (ej: '42["chat", {}]')
 * @param validator - Validador opcional para los datos
 * @returns ParseResult con el evento validado
 */
export function parseSocketIo42MessageWithSchema<T = any>(
  message: string,
  validator?: Validator<T>
): ParseResult<SocketIoEvent<T>> {
  const parsed = parseSocketIo42Message<T>(message);
  
  if (!parsed) {
    return {
      success: false,
      error: 'Invalid Socket.io message format'
    };
  }

  if (validator) {
    const validation = validator(parsed.data);
    if (!validation.success) {
      return {
        success: false,
        error: validation.error
      };
    }
    return {
      success: true,
      data: {
        eventName: parsed.eventName,
        data: validation.data
      }
    };
  }

  return {
    success: true,
    data: parsed
  };
}

/**
 * Esquemas de validación manual (reemplazan a Arktype)
 */
export const ArktypeSchemas = {
  /** Valida strings no vacíos */
  nonEmptyString: (data: any): ValidationResult<string> => {
    if (typeof data === 'string' && data.length > 0) return { success: true, data };
    return { success: false, error: 'Must be a non-empty string' };
  },
  
  /** Valida emails (simplificado) */
  email: (data: any): ValidationResult<string> => {
    if (typeof data === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) return { success: true, data };
    return { success: false, error: 'Must be a valid email' };
  },
  
  /** Valida URLs (simplificado) */
  url: (data: any): ValidationResult<string> => {
    try {
      if (typeof data === 'string') {
        new URL(data);
        return { success: true, data };
      }
    } catch {}
    return { success: false, error: 'Must be a valid URL' };
  },
  
  /** Valida números positivos */
  positiveNumber: (data: any): ValidationResult<number> => {
    if (typeof data === 'number' && data > 0) return { success: true, data };
    return { success: false, error: 'Must be a positive number' };
  },
  
  /** Valida números enteros */
  integer: (data: any): ValidationResult<number> => {
    if (typeof data === 'number' && Number.isInteger(data)) return { success: true, data };
    return { success: false, error: 'Must be an integer' };
  },
  
  /** Valida arrays no vacíos */
  nonEmptyArray: <T>(data: any): ValidationResult<T[]> => {
    if (Array.isArray(data) && data.length > 0) return { success: true, data };
    return { success: false, error: 'Must be a non-empty array' };
  },
  
  /** Valida objetos con llaves requeridas */
  requiredObject: (requiredKeys: string[]): Validator<Record<string, any>> => {
    return (data: any) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { success: false, error: 'Must be an object' };
      }
      for (const key of requiredKeys) {
        if (!(key in data)) return { success: false, error: `Missing required key: ${key}` };
      }
      return { success: true, data };
    };
  }
};

/**
 * Schemas for the API plugin (manual validation)
 */
export const ApiSchemas = {
  /** Schema for /write endpoint */
  write: (data: any): ValidationResult<{ command: string }> => {
    if (typeof data === 'object' && data !== null && typeof data.command === 'string' && data.command.length > 0) {
      return { success: true, data: data as { command: string } };
    }
    return { success: false, error: 'Invalid data for /write: command must be a non-empty string' };
  },
  
  /** Schema for /write-batch endpoint */
  writeBatch: (data: any): ValidationResult<{ commands: string[] }> => {
    if (typeof data === 'object' && data !== null && Array.isArray(data.commands) && data.commands.length > 0 && data.commands.every((c: any) => typeof c === 'string')) {
      return { success: true, data: data as { commands: string[] } };
    }
    return { success: false, error: 'Invalid data for /write-batch: commands must be a non-empty array of strings' };
  },
  
  /** Schema for WebSocket command messages */
  wsCommand: (data: any): ValidationResult<{ type: 'command'; command: string }> => {
    if (typeof data === 'object' && data !== null && data.type === 'command' && typeof data.command === 'string' && data.command.length > 0) {
      return { success: true, data: data as { type: 'command'; command: string } };
    }
    return { success: false, error: 'Invalid WebSocket command: type must be "command" and command must be a non-empty string' };
  }
};
