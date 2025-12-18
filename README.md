# 🛡️ Minecraft Server Guardian

Un gestor automatizado de servidores Minecraft escrito en TypeScript que simplifica la instalación, configuración y mantenimiento de servidores Minecraft con características avanzadas de respaldo y monitoreo.

## ✨ Características Principales

- **🚀 Instalación Automática**: Descarga e instala Java y el núcleo del servidor automáticamente
- **🔄 Gestión Inteligente**: Control completo del ciclo de vida del servidor
- **💾 Respaldo Automático**: Sistema de respaldos programados con cron
- **📊 Monitoreo en Tiempo Real**: Eventos y logs detallados del servidor
- **⚡ Auto-reinicio**: Recuperación automática ante fallos
- **🛠️ Configuración YAML**: Configuración flexible y legible
- **🔧 Multi-núcleo**: Soporte para Paper, Spigot y otros núcleos

## 📋 Requisitos Previos

- **Node.js** >= 18.0.0 o **Bun** >= 1.0.0
- **Sistema Operativo**: Windows, Linux o macOS
- **RAM**: Mínimo 2GB (recomendado 4GB+ para el servidor)
- **Espacio en Disco**: 1GB+ disponible

## 🚀 Instalación Rápida

```bash
# Clonar el repositorio
git clone https://github.com/nglmercer/minecraft-server
cd minecraft-server

# Instalar dependencias
bun install
# o si usas npm
npm install

# Iniciar el servidor
bun start
```

## ⚙️ Configuración

El archivo de configuración se encuentra en [`config/config.yaml`](config/config.yaml) y se genera automáticamente con valores predeterminados:

```yaml
server:
  jarPath: "server.jar"
  javaBin: "java"
  javaVersion: 21
  core: "paper"
  coreVersion: "1.21.1"
  jvmOptions:
    - "-Xmx4G"
    - "-Xms4G"
    - "-XX:+UseG1GC"
  programArgs:
    - "nogui"
    - "--port"
    - "25565"
  port: 25565
  cwd: "./data/server"

guardian:
  autoRestart: true
  maxRetries: 3
  retryDelayMs: 5000
  paths:
    data: "./data"
    logs: "./logs"
    backups: "./backups"
```

### 🔧 Opciones de Configuración

| Sección | Opción | Descripción | Valor por Defecto |
|---------|--------|-------------|-------------------|
| `server` | `javaVersion` | Versión de Java a instalar/usar | `21` |
| `server` | `core` | Tipo de núcleo (paper, spigot, etc.) | `paper` |
| `server` | `coreVersion` | Versión del núcleo Minecraft | `1.21.1` |
| `server` | `jvmOptions` | Opciones de la JVM | `["-Xmx2G", "-Xms2G"]` |
| `guardian` | `autoRestart` | Reinicio automático ante fallos | `true` |
| `guardian` | `maxRetries` | Máximo de reintentos | `3` |
| `guardian` | `retryDelayMs` | Delay entre reintentos (ms) | `5000` |

## 🎯 Uso

### Iniciar el Servidor

```bash
bun start
```

### Construir para Producción

```bash
bun run build
```

### Verificar Tipos

```bash
bun run typecheck
```

## 📁 Estructura del Proyecto

```
minecraft-server/
├── src/                    # Código fuente
│   ├── Config.ts          # Gestión de configuración
│   ├── guardian.ts        # Sistema principal Guardian
│   ├── java.service.ts    # Servicio de instalación Java
│   ├── core.service.ts    # Servicio de descarga de núcleos
│   ├── plugins/           # Plugins del sistema
│   │   └── backup.ts      # Plugin de respaldos
│   └── utils/             # Utilidades
├── config/                # Archivos de configuración
│   └── config.yaml        # Configuración principal
├── data/                  # Datos del servidor
├── logs/                  # Archivos de log
├── backups/               # Respaldos automáticos
├── tests/                 # Pruebas unitarias
└── index.ts              # Punto de entrada
```

## 🔌 Sistema de Plugins

El Guardian utiliza un sistema de plugins extensible. Actualmente incluye:

### BackupPlugin
- **Respaldo automático** cada día a las 4:00 AM
- **Retención** de los últimos 5 respaldos
- **Compresión** de archivos para ahorrar espacio
- **Configuración** mediante opciones en la inicialización

```typescript
const backupSystem = new BackupPlugin({
  cronSchedule: "0 0 4 * * *", // 4:00 AM diariamente
  backupPath: config.guardian.paths.backups,
  maxBackupsToKeep: 5,
});
```

## 📡 Sistema de Eventos

El Guardian emite eventos para monitorear el estado del servidor:

```typescript
guardian.on("error", (error) => {
  console.error("❌ Error crítico:", error);
});

guardian.on("status", (status) => {
  console.log("📊 Estado:", status);
});

guardian.on("output", (message) => {
  console.log("🎮 Salida del servidor:", message);
});

guardian.on("stopped", (event) => {
  console.log("⏹️ Servidor detenido:", event.reason);
  if (event.isCrash) {
    console.error("💥 Crash detectado:", event.code);
  }
});
```

### Eventos Disponibles

| Evento | Descripción | Datos |
|--------|-------------|-------|
| `error` | Errores críticos del sistema | `Error` object |
| `status` | Cambios de estado del servidor | `string` status |
| `output` | Logs del servidor Minecraft | `string` message |
| `log` | Logs internos del Guardian | `string` message |
| `stopped` | Servidor detenido | `{reason, code, isCrash}` |

## 🔄 Flujo de Inicialización

1. **Carga de Configuración**: Lee y valida [`config.yaml`](config/config.yaml)
2. **Instalación de Java**: Verifica/instala Java según la versión especificada
3. **Descarga del Núcleo**: Obtiene el JAR del servidor (Paper, Spigot, etc.)
4. **Actualización de Config**: Actualiza rutas de Java y JAR en la configuración
5. **Inicialización del Guardian**: Crea la instancia principal con plugins
6. **Registro de Eventos**: Configura manejadores de eventos
7. **Inicio del Servidor**: Lanza el proceso de Minecraft
8. **Manejo de Señales**: Configura apagado graceful con SIGINT

## 🛠️ Desarrollo

### Tecnologías Utilizadas

- **TypeScript**: Lenguaje principal
- **Bun**: Runtime y gestión de dependencias
- **YAML**: Formatos de configuración
- **Cron**: Programación de tareas
- **Tar**: Compresión de respaldos

### Arquitectura

El sistema sigue una arquitectura modular con separación de responsabilidades:

- **Config**: Gestión centralizada de configuración
- **Services**: Servicios especializados (Java, Core)
- **Guardian**: Núcleo de gestión del servidor
- **Plugins**: Sistema extensible para funcionalidades adicionales
- **Utils**: Utilidades compartidas

## 🐛 Solución de Problemas

### Error: "Failed to get or install Java"
- Verifica la conexión a internet
- Comprueba los permisos de escritura en el directorio
- Intenta especificar manualmente la ruta de Java en la configuración

### Error: "Installation failed"
- Revisa el archivo [`config/config.yaml`](config/config.yaml) por errores de formato
- Verifica que haya espacio suficiente en disco
- Comprueba los permisos de escritura

### El servidor no inicia
- Verifica que el puerto 25565 esté disponible
- Comprueba la configuración de la JVM (suficiente RAM asignada)
- Revisa los logs en [`logs/`](logs/) para errores específicos

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.
---

**Nota**: Este es un proyecto independiente y no está afiliado ni respaldado por Mojang Studios o Microsoft.