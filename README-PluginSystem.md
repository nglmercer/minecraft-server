# Sistema de Plugins de Minecraft Server Manager

Esta implementación proporciona un sistema de plugins modular para gestionar servidores de Minecraft. El núcleo del sistema es el Guardian, que gestiona el proceso del servidor de Minecraft, y los plugins permiten extender su funcionalidad de forma opcional.

## Componentes Principales

### Guardian
El Guardian es el componente central que gestiona el proceso del servidor de Minecraft:
- Inicia y detiene el servidor
- Gestiona los fallos y reinicios automáticos
- Proporciona acceso a la entrada/salida del servidor

### Config
El sistema de configuración centralizada que:
- Carga y guarda la configuración en formato JSON
- Proporciona métodos para acceder y modificar la configuración
- Soporta valores predeterminados

### BasePlugin
Clase abstracta para crear plugins personalizados que:
- Proporciona acceso común al Guardian y Config
- Implementa eventos comunes
- Define métodos abstractos para inicializar, iniciar y detener plugins

## Uso Básico

### Inicializar la aplicación

```typescript
import { App, app } from "./index";

// Obtener la instancia de la aplicación
const appInstance = App.getInstance();
```

### Crear un plugin personalizado

```typescript
import { BasePlugin } from "./src/app";

class MiPlugin extends BasePlugin {
  constructor(configPath?: string) {
    super(configPath);
  }

  protected setupPluginEvents(): void {
    // Configurar eventos específicos del plugin
    this.on("serverStatus", (status: string) => {
      console.log(`Estado del servidor: ${status}`);
    });
  }

  async start(): Promise<boolean> {
    // Lógica para iniciar el plugin
    console.log("MiPlugin iniciado");
    return true;
  }

  async stop(): Promise<boolean> {
    // Lógica para detener el plugin
    console.log("MiPlugin detenido");
    return true;
  }
}
```

### Registrar y usar plugins

```typescript
// Registrar plugins
app.registerPlugin("miPlugin", new MiPlugin());
app.registerPlugin("webServer", new WebServerPlugin());

// Inicializar todos los plugins
await app.initializePlugins();

// Iniciar todos los plugins
await app.startPlugins();

// Obtener un plugin específico
const webPlugin = app.getPlugin("webServer");
if (webPlugin) {
  // Interactuar con el Guardian a través del plugin
  await webPlugin.startMinecraftServer();
  webPlugin.sendMinecraftCommand("list");
  await webPlugin.stopMinecraftServer();
}
```

## Plugin de Servidor Web

El sistema incluye un plugin opcional de servidor web (`WebServerPlugin`) que proporciona una API REST para controlar el servidor de Minecraft:

### Endpoints de la API

- `GET /`: Estado de la API
- `GET /status`: Estado del servidor de Minecraft
- `POST /start`: Iniciar el servidor de Minecraft
- `POST /stop`: Detener el servidor de Minecraft
- `POST /command`: Enviar un comando al servidor
- `GET /config`: Obtener la configuración actual
- `PUT /config`: Actualizar la configuración

### Uso del plugin de servidor web

```typescript
import { App, WebServerPlugin } from "./index";

const appInstance = App.getInstance();

// Registrar el plugin de servidor web
appInstance.registerPlugin("webServer", new WebServerPlugin());

// Inicializar e iniciar los plugins
await appInstance.initializePlugins();
await appInstance.startPlugins();
```

## Configuración

La configuración se almacena en un archivo `config.json` en el directorio raíz del proyecto. El archivo se crea automáticamente con valores predeterminados si no existe.

### Estructura de la configuración

```json
{
  "server": {
    "jarPath": "server.jar",
    "javaBin": "java",
    "jvmOptions": ["-Xmx2G", "-Xms2G"],
    "programArgs": ["nogui"],
    "port": 25565
  },
  "guardian": {
    "autoRestart": true,
    "maxRetries": 3,
    "retryDelayMs": 5000
  },
  "security": {
    "wsPort": 3000,
    "authToken": "change-me-secure-token"
  },
  "discord": {
    "webhookUrl": ""
  }
}
```

## Ejemplo Completo

Ver `example.ts` para un ejemplo completo que muestra cómo:
- Registrar múltiples plugins
- Responder a eventos del servidor
- Usar la API REST del servidor web

## Arquitectura

```
src/
├── app.ts           # Clases base de la aplicación y plugins
├── Config.ts        # Sistema de configuración
├── guardian.ts      # Gestor del proceso del servidor de Minecraft
├── types.ts         # Definiciones de tipos
└── plugins/         # Plugins opcionales
    └── WebServerPlugin.ts  # Plugin de servidor web
```

## Desarrollo de Plugins

Para crear un nuevo plugin:

1. Extiende la clase `BasePlugin`
2. Implementa los métodos abstractos:
   - `setupPluginEvents()`: Configura eventos específicos del plugin
   - `start()`: Inicia el plugin
   - `stop()`: Detiene el plugin
3. Registra el plugin en la aplicación con `app.registerPlugin()`

### Eventos Disponibles

Los plugins pueden emitir y escuchar eventos:

- `serverStatus`: Cambio de estado del servidor
- `serverOutput`: Salida del servidor
- `serverStopped`: Detención del servidor
- `serverPid`: PID del proceso del servidor

## Licencia

Este proyecto está bajo la Licencia MIT.