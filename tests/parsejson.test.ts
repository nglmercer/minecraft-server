/**
 * Archivo de prueba para los parsers de JSON
 * Ejecutar con: bun test tests/parsejson.test.ts
 */

import { describe, test, expect } from 'bun:test';
import {
  parseSocketIo42Message,
  parseJson,
  parseJsonWithSchema,
  parseJsonArray,
  parseJsonArrayWithSchema,
  parseJsonObject,
  parseJsonObjectWithSchema,
  parseJsonPrimitive,
  parseJsonSafe,
  parseMultipleJson,
  parseAndFormatJson,
  parseSocketIo42MessageWithSchema,
  ArktypeSchemas,
  type Validator
} from '../src/utils/parsejson';

describe('parsejson.ts', () => {
  describe('parseSocketIo42Message', () => {
    test('debe parsear correctamente un mensaje Socket.io 42 válido', () => {
      const socketMessage = '42["chat", {"message": "Hola mundo"}]';
      const result = parseSocketIo42Message(socketMessage);
      
      expect(result).not.toBeNull();
      expect(result?.eventName).toBe('chat');
      expect(result?.data).toEqual({ message: 'Hola mundo' });
    });

    test('debe retornar null para mensajes sin prefijo 42', () => {
      const result = parseSocketIo42Message('["chat", {"message": "Hola"}]');
      expect(result).toBeNull();
    });

    test('debe manejar mensajes con solo el nombre del evento', () => {
      const socketMessage = '42["chat"]';
      const result = parseSocketIo42Message(socketMessage);
      
      expect(result).not.toBeNull();
      expect(result?.eventName).toBe('chat');
      expect(result?.data).toBeNull();
    });

    test('debe permitir renombrar las llaves de salida', () => {
      const socketMessage = '42["event", {"data": "test"}]';
      const result = parseSocketIo42Message(socketMessage, { event: 'evt', data: 'payload' });
      
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('evt', 'event');
      expect(result).toHaveProperty('payload', { data: 'test' });
    });
  });

  describe('parseJson', () => {
    test('debe parsear correctamente un JSON válido', () => {
      const validJson = '{"name": "Juan", "age": 30}';
      const result = parseJson(validJson);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'Juan', age: 30 });
    });

    test('debe manejar JSON inválido', () => {
      const invalidJson = '{name: "Juan"}';
      const result = parseJson(invalidJson);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('debe retornar error para input vacío', () => {
      const result = parseJson('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Input must be a non-empty string');
    });

    test('debe retornar error para input no string', () => {
      const result = parseJson(null as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Input must be a non-empty string');
    });
  });

  describe('parseJsonWithSchema', () => {
    test('debe validar correctamente contra el esquema', () => {
      const userValidator: Validator = (data: any) => {
        if (typeof data === 'object' && data !== null && typeof data.name === 'string' && typeof data.age === 'number') {
          return { success: true, data };
        }
        return { success: false, error: 'Invalid user' };
      };
      const userJson = '{"name": "Maria", "age": 25}';
      const result = parseJsonWithSchema(userJson, userValidator);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "Maria", age: 25 });
    });

    test('debe rechazar datos que no cumplen el esquema', () => {
      const userValidator: Validator = (data: any) => {
        if (typeof data === 'object' && data !== null && typeof data.name === 'string') {
          return { success: true, data };
        }
        return { success: false, error: 'Invalid user' };
      };
      const invalidUserJson = '{"age": 25}';
      const result = parseJsonWithSchema(invalidUserJson, userValidator);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid user');
    });
  });

  describe('parseJsonArray', () => {
    test('debe parsear correctamente un array JSON', () => {
      const arrayJson = '[1, 2, 3, 4, 5]';
      const result = parseJsonArray(arrayJson);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3, 4, 5]);
    });

    test('debe rechazar JSON que no es un array', () => {
      const notArrayJson = '{"key": "value"}';
      const result = parseJsonArray(notArrayJson);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Parsed JSON is not an array');
    });

    test('debe manejar arrays vacíos', () => {
      const emptyArrayJson = '[]';
      const result = parseJsonArray(emptyArrayJson);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('parseJsonArrayWithSchema', () => {
    test('debe validar cada elemento del array', () => {
      const numberValidator: Validator<number> = (data: any) => {
        if (typeof data === 'number') return { success: true, data };
        return { success: false, error: 'Not a number' };
      };
      const numberArrayJson = '[10, 20, 30, 40, 50]';
      const result = parseJsonArrayWithSchema(numberArrayJson, numberValidator);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual([10, 20, 30, 40, 50]);
    });

    test('debe rechazar array con elementos inválidos', () => {
      const numberValidator: Validator<number> = (data: any) => {
        if (typeof data === 'number') return { success: true, data };
        return { success: false, error: 'Not a number' };
      };
      const invalidArrayJson = '[10, "not a number", 30]';
      const result = parseJsonArrayWithSchema(invalidArrayJson, numberValidator);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Error at index 1');
    });
  });

  describe('parseJsonObject', () => {
    test('debe parsear correctamente un objeto JSON', () => {
      const objectJson = '{"id": 1, "title": "Test"}';
      const result = parseJsonObject(objectJson);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, title: 'Test' });
    });

    test('debe rechazar JSON que no es un objeto', () => {
      const arrayJson = '[1, 2, 3]';
      const result = parseJsonObject(arrayJson);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Parsed JSON is not an object');
    });

    test('debe rechazar null', () => {
      const result = parseJsonObject('null');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Parsed JSON is not an object');
    });
  });

  describe('parseJsonObjectWithSchema', () => {
    test('debe validar el objeto contra el esquema', () => {
      const productValidator: Validator = (data: any) => {
        if (typeof data === 'object' && data !== null && typeof data.id === 'number' && typeof data.name === 'string' && typeof data.price === 'number' && data.price > 0) {
          return { success: true, data };
        }
        return { success: false, error: 'Invalid product' };
      };
      const productJson = '{"id": 1, "name": "Laptop", "price": 999.99}';
      const result = parseJsonObjectWithSchema(productJson, productValidator);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 1, name: 'Laptop', price: 999.99 });
    });

    test('debe rechazar objeto que no cumple el esquema', () => {
      const productValidator: Validator = (data: any) => {
        if (typeof data === 'object' && data !== null && typeof data.price === 'number' && data.price > 0) {
          return { success: true, data };
        }
        return { success: false, error: 'Invalid price' };
      };
      const invalidProductJson = '{"id": 1, "name": "Laptop", "price": -10}';
      const result = parseJsonObjectWithSchema(invalidProductJson, productValidator);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid price');
    });
  });

  describe('parseJsonPrimitive', () => {
    test('debe parsear strings JSON', () => {
      const result = parseJsonPrimitive('"texto"');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('texto');
    });

    test('debe parsear números JSON', () => {
      const result = parseJsonPrimitive('123');
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(123);
    });

    test('debe parsear booleanos JSON', () => {
      const resultTrue = parseJsonPrimitive('true');
      const resultFalse = parseJsonPrimitive('false');
      
      expect(resultTrue.success).toBe(true);
      expect(resultTrue.data).toBe(true);
      expect(resultFalse.success).toBe(true);
      expect(resultFalse.data).toBe(false);
    });

    test('debe parsear null JSON', () => {
      const result = parseJsonPrimitive('null');
      
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    test('debe rechazar objetos y arrays', () => {
      const resultObject = parseJsonPrimitive('{"key": "value"}');
      const resultArray = parseJsonPrimitive('[1, 2, 3]');
      
      expect(resultObject.success).toBe(false);
      expect(resultObject.error).toBe('Parsed JSON is not a primitive value');
      expect(resultArray.success).toBe(false);
      expect(resultArray.error).toBe('Parsed JSON is not a primitive value');
    });
  });

  describe('parseJsonSafe', () => {
    test('debe parsear JSON complejo con maxDepth suficiente', () => {
      const complexJson = '{"nested": {"deep": {"value": 42}}}';
      const result = parseJsonSafe(complexJson, { strict: true, maxDepth: 5 });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ nested: { deep: { value: 42 } } });
    });

    test('debe rechazar JSON que excede maxDepth', () => {
      const complexJson = '{"nested": {"deep": {"value": 42}}}';
      const result = parseJsonSafe(complexJson, { strict: true, maxDepth: 1 });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed depth');
    });

    test('debe funcionar sin opciones', () => {
      const simpleJson = '{"key": "value"}';
      const result = parseJsonSafe(simpleJson);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'value' });
    });

    test('debe soportar función reviver', () => {
      const json = '{"date": "2023-01-01"}';
      const result = parseJsonSafe(json, {
        reviver: (key, value) => {
          if (key === 'date') return new Date(value);
          return value;
        }
      });
      
      expect(result.success).toBe(true);
      expect(result.data?.date).toBeInstanceOf(Date);
    });
  });

  describe('parseMultipleJson', () => {
    test('debe parsear múltiples JSONs', () => {
      const multipleJsons = ['{"a": 1}', '{"b": 2}', '{"c": 3}'];
      const results = parseMultipleJson(multipleJsons);
      
      expect(results).toHaveLength(3);
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.data).toEqual({ a: 1 });
      expect(results[1]!.success).toBe(true);
      expect(results[1]!.data).toEqual({ b: 2 });
      expect(results[2]!.success).toBe(true);
      expect(results[2]!.data).toEqual({ c: 3 });
    });

    test('debe manejar mezcla de JSONs válidos e inválidos', () => {
      const mixedJsons = ['{"a": 1}', '{invalid}', '{"c": 3}'];
      const results = parseMultipleJson(mixedJsons);
      
      expect(results).toHaveLength(3);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
      expect(results[2]!.success).toBe(true);
    });
  });

  describe('parseAndFormatJson', () => {
    test('debe formatear JSON con indentación', () => {
      const unformattedJson = '{"name":"John","age":30,"city":"New York"}';
      const result = parseAndFormatJson(unformattedJson, 2);
      
      expect(result.success).toBe(true);
      expect(result.data).toContain('  "name"');
      expect(result.data).toContain('  "age"');
      expect(result.data).toContain('  "city"');
    });

    test('debe usar indentación por defecto de 2 espacios', () => {
      const unformattedJson = '{"key":"value"}';
      const result = parseAndFormatJson(unformattedJson);
      
      expect(result.success).toBe(true);
      expect(result.data).toContain('  "key"');
    });

    test('debe propagar errores de parseo', () => {
      const invalidJson = '{invalid}';
      const result = parseAndFormatJson(invalidJson);
      
      expect(result.success).toBe(false);
    });
  });

  describe('parseSocketIo42MessageWithSchema', () => {
    test('debe parsear y validar mensaje Socket.io con validador', () => {
      const messageValidator: Validator = (data: any) => {
        if (typeof data === 'object' && data !== null && typeof data.text === 'string' && typeof data.timestamp === 'number') {
          return { success: true, data };
        }
        return { success: false, error: 'Invalid message' };
      };
      const socketMessage = '42["message", {"text": "Hola!", "timestamp": 1234567890}]';
      const result = parseSocketIo42MessageWithSchema(socketMessage, messageValidator);
      
      expect(result.success).toBe(true);
      expect(result.data?.eventName).toBe('message');
      expect(result.data?.data).toEqual({ text: 'Hola!', timestamp: 1234567890 });
    });

    test('debe rechazar mensaje con datos inválidos', () => {
      const messageValidator: Validator = (data: any) => {
        if (typeof data === 'object' && data !== null && typeof data.timestamp === 'number') {
          return { success: true, data };
        }
        return { success: false, error: 'Missing timestamp' };
      };
      const socketMessage = '42["message", {"text": "Hola!"}]';
      const result = parseSocketIo42MessageWithSchema(socketMessage, messageValidator);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing timestamp');
    });

    test('debe rechazar formato inválido de Socket.io', () => {
      const messageValidator: Validator = (data: any) => ({ success: true, data });
      const invalidMessage = 'invalid message';
      const result = parseSocketIo42MessageWithSchema(invalidMessage, messageValidator);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Socket.io message format');
    });

    test('debe funcionar sin validador', () => {
      const socketMessage = '42["message", {"text": "Hola!"}]';
      const result = parseSocketIo42MessageWithSchema(socketMessage);
      
      expect(result.success).toBe(true);
      expect(result.data?.eventName).toBe('message');
      expect(result.data?.data).toEqual({ text: 'Hola!' });
    });
  });

  describe('ArktypeSchemas', () => {
    test('nonEmptyString debe validar strings no vacíos', () => {
      expect(ArktypeSchemas.nonEmptyString('Hola').success).toBe(true);
      expect(ArktypeSchemas.nonEmptyString('').success).toBe(false);
    });

    test('email debe validar emails', () => {
      expect(ArktypeSchemas.email('test@example.com').success).toBe(true);
      expect(ArktypeSchemas.email('not-an-email').success).toBe(false);
    });

    test('url debe validar URLs', () => {
      expect(ArktypeSchemas.url('https://example.com').success).toBe(true);
      expect(ArktypeSchemas.url('not-a-url').success).toBe(false);
    });

    test('positiveNumber debe validar números positivos', () => {
      expect(ArktypeSchemas.positiveNumber(42).success).toBe(true);
      expect(ArktypeSchemas.positiveNumber(-1).success).toBe(false);
      expect(ArktypeSchemas.positiveNumber(0).success).toBe(false);
    });

    test('integer debe validar enteros', () => {
      expect(ArktypeSchemas.integer(7).success).toBe(true);
      expect(ArktypeSchemas.integer(7.5).success).toBe(false);
    });

    test('nonEmptyArray debe validar arrays no vacíos', () => {
      expect(ArktypeSchemas.nonEmptyArray([1, 2, 3]).success).toBe(true);
      expect(ArktypeSchemas.nonEmptyArray([]).success).toBe(false);
    });

    test('requiredObject debe validar objetos con llaves requeridas', () => {
      const validator = ArktypeSchemas.requiredObject(['name', 'age']);
      expect(validator({ name: 'Juan', age: 30 }).success).toBe(true);
      expect(validator({ name: 'Juan' }).success).toBe(false);
    });
  });
});
