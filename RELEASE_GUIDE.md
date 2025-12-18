# 🚀 Guía de Releases - Minecraft Server Guardian

Esta guía explica cómo crear releases y activar el workflow de GitHub Actions para generar ejecutables multiplataforma.

## 📋 Requisitos Previos

- Git instalado y configurado
- Acceso al repositorio remoto
- Permisos para crear tags en el repositorio

## 🎯 Crear un Nuevo Release

###  Manual con Git

```bash
# Crear un tag anotado
git tag -a v1.0.0 -m "Release v1.0.0

- Minecraft Server Guardian Release
- Nueva funcionalidad X
- Corrección de bug Y"

# Subir el tag al repositorio
git push origin v1.0.0
```

## 🏷️ Convención de Versiones

Usamos [SemVer](https://semver.org/) (Versionado Semántico):

- **v1.0.0** - Release mayor (cambios importantes)
- **v1.1.0** - Release menor (nuevas funcionalidades)
- **v1.0.1** - Parche (correcciones de bugs)

### Formatos Aceptados:
- `v1.0.0` (estable)
- `v1.0.0-beta1` (pre-release)
- `v1.0.0-rc1` (release candidate)

## 🔄 Workflow de GitHub Actions

Cuando creas un tag con el formato `v*`, se activa automáticamente el workflow que:

1. **Compila** el proyecto para múltiples plataformas:
   - Linux x64
   - Linux ARM64
   - Windows x64
   - macOS x64
   - macOS ARM64

2. **Crea un Release** en GitHub con:
   - Todos los ejecutables
   - Notas de la versión
   - Assets descargables

3. **Notifica** sobre el éxito o fallo del proceso

## 📦 Assets Generados

El workflow genera los siguientes ejecutables:

| Plataforma | Archivo | Arquitectura |
|------------|---------|--------------|
| Linux | `app-linux` | x64 |
| Linux | `app-linux-arm64` | ARM64 |
| Windows | `app-windows.exe` | x64 |
| macOS | `app-macos` | x64 |
| macOS | `app-macos-arm64` | ARM64 |

---

¿Necesitas ayuda? Consulta los [issues del repositorio](https://github.com/nglmercer/minecraft-server/issues) o contacta al equipo de desarrollo.